#!/usr/bin/env node
/**
 * Skyrewall Admin CLI
 * Usage: npx tsx scripts/admin-cli.ts
 *
 * Requires DATABASE_URL and ENCRYPTION_KEY environment variables.
 * Loads from .env in the project root if present.
 */

import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { Pool } from 'pg';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createDecipheriv, scryptSync as _scryptSync } from 'crypto';

// ──────────────────────────────────────────────────────────────────────────────
// Bootstrap: load .env from project root
// ──────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

function loadDotEnv(): void {
  const envPath = join(PROJECT_ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnv();

// ──────────────────────────────────────────────────────────────────────────────
// ANSI colour helpers
// ──────────────────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
};

const bold   = (s: string) => `${C.bold}${s}${C.reset}`;
const red    = (s: string) => `${C.red}${s}${C.reset}`;
const green  = (s: string) => `${C.green}${s}${C.reset}`;
const yellow = (s: string) => `${C.yellow}${s}${C.reset}`;
const cyan   = (s: string) => `${C.cyan}${s}${C.reset}`;
const dim    = (s: string) => `${C.dim}${s}${C.reset}`;

// ──────────────────────────────────────────────────────────────────────────────
// Database connection
// ──────────────────────────────────────────────────────────────────────────────

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error(red('❌  DATABASE_URL environment variable is not set.'));
      process.exit(1);
    }
    pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 10000 });
  }
  return pool;
}

async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Encryption helpers (mirrors src/lib/encryption.ts — no @/ alias here)
// ──────────────────────────────────────────────────────────────────────────────

const ALGORITHM  = 'aes-256-gcm';
const KEY_LENGTH = 32;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return _scryptSync(secret, salt, KEY_LENGTH) as Buffer;
}

function tryDecrypt(ciphertext: string): string | null {
  try {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) return null;
    const parts = ciphertext.split(':');
    if (parts.length !== 4) return null;
    const [saltHex, ivHex, tagHex, encryptedHex] = parts;
    const salt      = Buffer.from(saltHex, 'hex');
    const iv        = Buffer.from(ivHex, 'hex');
    const tag       = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const key       = deriveKey(secret, salt);
    const decipher  = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

function isValidEncryptedPasswordFormat(val: string): boolean {
  const parts = val.split(':');
  if (parts.length !== 4) return false;
  return parts.every(p => /^[0-9a-f]+$/i.test(p) && p.length > 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  handle: string;
  encrypted_password: string | null;
  did: string | null;
  created_at: Date;
  blocks_imported_at: Date | null;
  oauth_error_since: Date | null;
}

interface IntegrityIssue {
  level: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
}

interface IntegrityReport {
  user: UserRow;
  issues: IntegrityIssue[];
  stats: {
    subscriptions: number;
    pausedSubscriptions: number;
    blockEvents: number;
    muteEvents: number;
    whitelistEntries: number;
    hasOAuthSession: boolean;
    oauthSessionUpdatedAt: Date | null;
    syncFailureSubscriptions: number;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Integrity checks
// ──────────────────────────────────────────────────────────────────────────────

async function buildIntegrityReport(userId: string): Promise<IntegrityReport | null> {
  const users = await dbQuery<UserRow>(
    `SELECT id, handle, encrypted_password, did, created_at, blocks_imported_at, oauth_error_since
     FROM users WHERE id = $1`,
    [userId]
  );
  if (users.length === 0) return null;
  const user = users[0];
  const issues: IntegrityIssue[] = [];

  // ── Auth method checks ────────────────────────────────────────────────────
  const hasPassword = !!user.encrypted_password;
  const hasDid      = !!user.did;

  if (!hasPassword && !hasDid) {
    issues.push({
      level: 'critical',
      code: 'NO_AUTH_METHOD',
      message: 'User has neither an encrypted password nor a DID — cannot authenticate at all.',
    });
  }

  if (hasPassword) {
    const pwOk = isValidEncryptedPasswordFormat(user.encrypted_password!);
    if (!pwOk) {
      issues.push({
        level: 'critical',
        code: 'MALFORMED_PASSWORD',
        message: 'encrypted_password exists but does not match expected AES-256-GCM format (salt:iv:tag:cipher).',
      });
    } else {
      // Try to actually decrypt
      const enc = process.env.ENCRYPTION_KEY;
      if (enc) {
        const plaintext = tryDecrypt(user.encrypted_password!);
        if (plaintext === null) {
          issues.push({
            level: 'critical',
            code: 'DECRYPT_FAILED',
            message: 'encrypted_password cannot be decrypted with current ENCRYPTION_KEY. Key may have changed.',
          });
        } else if (plaintext.trim() === '') {
          issues.push({
            level: 'warning',
            code: 'EMPTY_PASSWORD',
            message: 'Decrypted password is empty string.',
          });
        }
      } else {
        issues.push({
          level: 'warning',
          code: 'NO_ENCRYPTION_KEY',
          message: 'ENCRYPTION_KEY not set — cannot verify password decryptability.',
        });
      }
    }
  }

  // ── OAuth checks ──────────────────────────────────────────────────────────
  const oauthRows = await dbQuery<{ did: string; updated_at: Date }>(
    'SELECT did, updated_at FROM oauth_sessions WHERE did = $1',
    [user.did ?? '']
  );
  const hasOAuthSession = oauthRows.length > 0;
  const oauthSessionUpdatedAt = hasOAuthSession ? oauthRows[0].updated_at : null;

  if (hasDid && !hasOAuthSession) {
    issues.push({
      level: 'warning',
      code: 'OAUTH_SESSION_MISSING',
      message: `User has DID (${user.did}) but no OAuth session row — user must re-authenticate via OAuth.`,
    });
  }

  if (!hasDid && hasOAuthSession) {
    issues.push({
      level: 'warning',
      code: 'ORPHANED_OAUTH_SESSION',
      message: 'An OAuth session row exists but user.did is NULL — orphaned oauth_sessions entry.',
    });
  }

  if (user.oauth_error_since) {
    issues.push({
      level: 'warning',
      code: 'OAUTH_ERROR_ACTIVE',
      message: `OAuth has been failing since ${user.oauth_error_since.toISOString()} — subscriptions may not sync.`,
    });
  }

  // ── DID format check ─────────────────────────────────────────────────────
  if (hasDid && !user.did!.startsWith('did:')) {
    issues.push({
      level: 'critical',
      code: 'INVALID_DID_FORMAT',
      message: `DID value "${user.did}" does not start with "did:" — invalid AT Protocol DID.`,
    });
  }

  // ── Subscription checks ───────────────────────────────────────────────────
  const subs = await dbQuery<{
    id: string;
    target_handle: string;
    mode: string;
    sub_type: string;
    paused_reason: string | null;
    sync_failure_count: number;
    created_at: Date;
    config: Record<string, unknown>;
  }>(
    `SELECT id, target_handle, mode, sub_type, paused_reason, sync_failure_count, created_at, config
     FROM subscriptions WHERE user_id = $1`,
    [userId]
  );

  const pausedSubs = subs.filter(s => s.paused_reason !== null);
  const failingSubs = subs.filter(s => s.sync_failure_count > 0);

  if (pausedSubs.length > 0) {
    issues.push({
      level: 'warning',
      code: 'SUBSCRIPTIONS_PAUSED',
      message: `${pausedSubs.length} subscription(s) paused: ${pausedSubs.map(s => `${s.target_handle} (${s.paused_reason})`).join(', ')}`,
    });
  }

  if (failingSubs.length > 0) {
    issues.push({
      level: 'warning',
      code: 'SUBSCRIPTIONS_FAILING',
      message: `${failingSubs.length} subscription(s) have sync failures: ${failingSubs.map(s => `${s.target_handle} (${s.sync_failure_count} failures)`).join(', ')}`,
    });
  }

  // ── Block / mute event stats ───────────────────────────────────────────────
  const eventsRows = await dbQuery<{ action: string; count: string }>(
    `SELECT action, COUNT(*) as count FROM block_events WHERE user_id = $1 GROUP BY action`,
    [userId]
  );
  const blockEvents = parseInt(eventsRows.find(r => r.action === 'block')?.count ?? '0', 10);
  const muteEvents  = parseInt(eventsRows.find(r => r.action === 'mute')?.count  ?? '0', 10);

  if (blockEvents + muteEvents > 50000) {
    issues.push({
      level: 'info',
      code: 'HIGH_EVENT_COUNT',
      message: `User has ${blockEvents + muteEvents} total block/mute event records — consider archiving old data.`,
    });
  }

  // ── Whitelist ─────────────────────────────────────────────────────────────
  const wlRows = await dbQuery<{ count: string }>(
    'SELECT COUNT(*) as count FROM whitelists WHERE user_id = $1',
    [userId]
  );
  const whitelistEntries = parseInt(wlRows[0]?.count ?? '0', 10);

  // ── Data completeness checks ──────────────────────────────────────────────
  if (!user.blocks_imported_at && (blockEvents + muteEvents) === 0 && subs.length === 0) {
    issues.push({
      level: 'info',
      code: 'NO_DATA',
      message: 'User has no subscriptions, no block/mute events and no import — account may be freshly registered.',
    });
  }

  return {
    user,
    issues,
    stats: {
      subscriptions: subs.length,
      pausedSubscriptions: pausedSubs.length,
      blockEvents,
      muteEvents,
      whitelistEntries,
      hasOAuthSession,
      oauthSessionUpdatedAt,
      syncFailureSubscriptions: failingSubs.length,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Report renderer
// ──────────────────────────────────────────────────────────────────────────────

function printReport(report: IntegrityReport): void {
  const { user, issues, stats } = report;

  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold(`  📋 Integrity Report — ${cyan(user.handle)}`));
  console.log(bold('━'.repeat(60)));

  console.log(`  ${bold('ID:')}           ${dim(user.id)}`);
  console.log(`  ${bold('Handle:')}       ${user.handle}`);
  console.log(`  ${bold('DID:')}          ${user.did ? cyan(user.did) : dim('(none)')}`);
  console.log(`  ${bold('Password:')}     ${user.encrypted_password ? green('✔ stored (encrypted)') : yellow('✗ NULL (OAuth-only or reset)')}`);
  console.log(`  ${bold('Created:')}      ${user.created_at.toISOString()}`);
  console.log(`  ${bold('Blocks imported:')} ${user.blocks_imported_at ? user.blocks_imported_at.toISOString() : dim('not yet')}`);
  console.log(`  ${bold('OAuth error:')}  ${user.oauth_error_since ? red(`since ${user.oauth_error_since.toISOString()}`) : green('none')}`);

  console.log('\n' + bold('  📊 Data Statistics'));
  console.log(`     Subscriptions:   ${stats.subscriptions} (${stats.pausedSubscriptions} paused, ${stats.syncFailureSubscriptions} with sync errors)`);
  console.log(`     Block events:    ${stats.blockEvents}`);
  console.log(`     Mute events:     ${stats.muteEvents}`);
  console.log(`     Whitelist:       ${stats.whitelistEntries} entries`);
  console.log(`     OAuth session:   ${stats.hasOAuthSession ? green(`active (updated ${stats.oauthSessionUpdatedAt?.toISOString() ?? '?'})`) : dim('none')}`);

  console.log('\n' + bold('  🔍 Issues Found'));
  if (issues.length === 0) {
    console.log(`     ${green('✅  No issues — user record appears healthy.')}`);
  } else {
    for (const issue of issues) {
      const icon  = issue.level === 'critical' ? red('✖') : issue.level === 'warning' ? yellow('⚠') : cyan('ℹ');
      const label = issue.level === 'critical' ? red(`[${issue.code}]`) :
                    issue.level === 'warning'  ? yellow(`[${issue.code}]`) :
                                                  cyan(`[${issue.code}]`);
      console.log(`     ${icon} ${label} ${issue.message}`);
    }
  }
  console.log(bold('━'.repeat(60)) + '\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// Backup / Restore
// ──────────────────────────────────────────────────────────────────────────────

const BACKUP_DIR = join(PROJECT_ROOT, 'backups');

function ensureBackupDir(): void {
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

async function doBackup(): Promise<void> {
  ensureBackupDir();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log(red('❌  DATABASE_URL not set.'));
    return;
  }

  const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `skyrewall-backup-${ts}.sql`;
  const filepath = join(BACKUP_DIR, filename);

  console.log(dim(`  Running pg_dump → ${filepath} …`));

  const result = spawnSync('pg_dump', ['--no-password', '--format=plain', '--file', filepath, dbUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.error) {
    // pg_dump not in PATH — fall back to in-process SQL dump
    console.log(yellow('  ⚠  pg_dump not found in PATH — falling back to SQL export via pg driver.'));
    await fallbackSqlDump(filepath);
    return;
  }

  if (result.status !== 0) {
    console.log(red(`  ❌  pg_dump failed (exit ${result.status}):`));
    console.log(red(result.stderr ?? '(no stderr)'));
    return;
  }

  console.log(green(`  ✅  Backup saved to ${bold(filepath)}`));
}

async function fallbackSqlDump(filepath: string): Promise<void> {
  // Minimal SQL dump using pg driver — exports data as INSERT statements.
  const tables = ['users', 'subscriptions', 'block_events', 'whitelists', 'oauth_sessions', 'oauth_states', 'list_cache'];
  const lines: string[] = [
    `-- Skyrewall SQL dump (in-process fallback)`,
    `-- Generated at ${new Date().toISOString()}`,
    `-- WARNING: This is a data-only dump. Schema is not included.`,
    `-- Restore with: psql $DATABASE_URL < <file>`,
    ``,
    `BEGIN;`,
    ``,
  ];

  for (const table of tables) {
    try {
      const rows = await dbQuery<Record<string, unknown>>(`SELECT * FROM ${table}`);
      if (rows.length === 0) {
        lines.push(`-- Table ${table}: (empty)`);
        continue;
      }
      lines.push(`-- Table: ${table} (${rows.length} rows)`);
      const cols = Object.keys(rows[0]);
      for (const row of rows) {
        const vals = cols.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'number' || typeof v === 'boolean') return String(v);
          if (v instanceof Date) return `'${v.toISOString()}'`;
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
          return `'${String(v).replace(/'/g, "''")}'`;
        });
        lines.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;`);
      }
      lines.push('');
    } catch (e) {
      lines.push(`-- Skipped table ${table}: ${(e as Error).message}`);
    }
  }

  lines.push('COMMIT;', '');
  writeFileSync(filepath, lines.join('\n'), 'utf8');
  console.log(green(`  ✅  Fallback SQL dump saved to ${bold(filepath)}`));
}

async function doRestore(rl: Awaited<ReturnType<typeof createInterface>>): Promise<void> {
  ensureBackupDir();
  const files = existsSync(BACKUP_DIR)
    ? readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql')).sort().reverse()
    : [];

  if (files.length === 0) {
    console.log(yellow('  ⚠  No backup files found in ' + BACKUP_DIR));
    return;
  }

  console.log('\n  Available backups:');
  files.slice(0, 20).forEach((f, i) => console.log(`    ${bold(String(i + 1))}. ${f}`));
  console.log(`    ${bold('0')}. Cancel`);

  const choice = await rl.question('\n  Select backup number: ');
  const idx    = parseInt(choice, 10);
  if (!idx || idx < 1 || idx > files.length) {
    console.log(dim('  Cancelled.'));
    return;
  }

  const file = join(BACKUP_DIR, files[idx - 1]);
  console.log(yellow(`\n  ⚠  This will restore ${bold(files[idx - 1])} into the current database.`));
  console.log(red(  `     ALL conflicting rows will be skipped (ON CONFLICT DO NOTHING).`));
  const confirm = await rl.question('  Type YES to proceed: ');
  if (confirm.trim() !== 'YES') {
    console.log(dim('  Cancelled.'));
    return;
  }

  const dbUrl = process.env.DATABASE_URL!;
  console.log(dim('  Restoring …'));

  const result = spawnSync('psql', ['--no-password', '--file', file, dbUrl], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.error) {
    console.log(red('  ❌  psql not found in PATH. Please restore manually:'));
    console.log(dim(`     psql "$DATABASE_URL" < "${file}"`));
    return;
  }

  if (result.status !== 0) {
    console.log(red(`  ❌  psql failed (exit ${result.status}):`));
    console.log(red(result.stderr ?? '(no stderr)'));
    return;
  }

  console.log(green(`  ✅  Restore complete.`));
  if (result.stdout) console.log(dim(result.stdout.slice(0, 500)));
}

// ──────────────────────────────────────────────────────────────────────────────
// User search
// ──────────────────────────────────────────────────────────────────────────────

async function searchUsers(term: string): Promise<UserRow[]> {
  const t = term.trim().toLowerCase();
  return dbQuery<UserRow>(
    `SELECT id, handle, encrypted_password, did, created_at, blocks_imported_at, oauth_error_since
     FROM users
     WHERE LOWER(handle) LIKE $1
        OR LOWER(did) = $2
        OR LOWER(id::text) = $2
     ORDER BY handle
     LIMIT 20`,
    [`%${t}%`, t]
  );
}

function printUserList(users: UserRow[]): void {
  if (users.length === 0) {
    console.log(yellow('  No users found.'));
    return;
  }
  console.log('');
  console.log(`  ${'#'.padEnd(3)} ${'Handle'.padEnd(30)} ${'DID'.padEnd(34)} ${'PW'.padEnd(4)} ${'OA Err'.padEnd(6)}`);
  console.log('  ' + '─'.repeat(80));
  users.forEach((u, i) => {
    const num   = bold(String(i + 1).padEnd(3));
    const handle= u.handle.padEnd(30);
    const did   = (u.did ? u.did.slice(0, 32) : '(none)').padEnd(34);
    const pw    = u.encrypted_password ? green('yes') : yellow('no ');
    const oaErr = u.oauth_error_since  ? red('yes')   : green('no ');
    console.log(`  ${num} ${handle} ${did} ${pw}  ${oaErr}`);
  });
  console.log('');
}

// ──────────────────────────────────────────────────────────────────────────────
// User reset (password → NULL)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Security note: setting encrypted_password = NULL is safe.
 * The login route (src/app/api/auth/login/route.ts) always verifies credentials
 * against the user's live BlueSky PDS first, then stores the new password.
 * A NULL password means "no app-password cached"; the user can log in again with
 * a valid BlueSky handle+password and the new password will be stored.
 * There is NO path in the codebase that grants session access based solely on
 * a NULL / missing encrypted_password — the BlueSky API check is mandatory.
 */
async function userReset(
  userId: string,
  rl: Awaited<ReturnType<typeof createInterface>>
): Promise<void> {
  const report = await buildIntegrityReport(userId);
  if (!report) { console.log(red('  User not found.')); return; }

  printReport(report);

  console.log(yellow(bold('  ⚠  USER RESET will:')));
  console.log(yellow('     • Set encrypted_password → NULL'));
  console.log(yellow('     • Clear oauth_error_since → NULL'));
  console.log(yellow('     • Leave all subscriptions, block events, whitelist INTACT'));
  console.log(yellow('     • The account itself is PRESERVED'));
  console.log(yellow('     • User can log in again via BlueSky handle+password or OAuth'));
  console.log('');

  const confirm = await rl.question(`  Type the handle ${bold(report.user.handle)} to confirm reset: `);
  if (confirm.trim() !== report.user.handle) {
    console.log(dim('  Cancelled — handle did not match.'));
    return;
  }

  await dbQuery(
    'UPDATE users SET encrypted_password = NULL, oauth_error_since = NULL WHERE id = $1',
    [userId]
  );

  console.log(green(`  ✅  Reset complete for ${bold(report.user.handle)}.`));
  console.log(green('     Password cleared. User can re-authenticate on next login.'));
}

// ──────────────────────────────────────────────────────────────────────────────
// User wipe (full delete)
// ──────────────────────────────────────────────────────────────────────────────

async function userWipe(
  userId: string,
  rl: Awaited<ReturnType<typeof createInterface>>
): Promise<void> {
  const report = await buildIntegrityReport(userId);
  if (!report) { console.log(red('  User not found.')); return; }

  printReport(report);

  console.log(red(bold('  ⛔  USER WIPE will PERMANENTLY DELETE:')));
  console.log(red(`     • User record for ${report.user.handle} (${userId})`));
  console.log(red(`     • ${report.stats.subscriptions} subscription(s) (CASCADE)`));
  console.log(red(`     • ${report.stats.blockEvents + report.stats.muteEvents} block/mute event(s) (CASCADE)`));
  console.log(red(`     • ${report.stats.whitelistEntries} whitelist entr(ies) (CASCADE)`));
  if (report.stats.hasOAuthSession) {
    console.log(red(`     • OAuth session row`));
  }
  console.log(red('     This CANNOT be undone. Consider taking a backup first!\n'));

  const step1 = await rl.question(`  Step 1 — Type the handle ${bold(report.user.handle)} to proceed: `);
  if (step1.trim() !== report.user.handle) {
    console.log(dim('  Cancelled — handle did not match.'));
    return;
  }

  const step2 = await rl.question('  Step 2 — Type WIPE to permanently delete this user: ');
  if (step2.trim() !== 'WIPE') {
    console.log(dim('  Cancelled — confirmation word did not match.'));
    return;
  }

  // Remove orphaned oauth_sessions row (not foreign-keyed to users)
  if (report.user.did) {
    await dbQuery('DELETE FROM oauth_sessions WHERE did = $1', [report.user.did]);
  }

  // Cascades handle: subscriptions, block_events, whitelists
  await dbQuery('DELETE FROM users WHERE id = $1', [userId]);

  console.log(red(bold(`  ✅  User ${report.user.handle} has been permanently wiped from the database.`)));
}

// ──────────────────────────────────────────────────────────────────────────────
// Interactive user selection
// ──────────────────────────────────────────────────────────────────────────────

async function pickUser(
  rl: Awaited<ReturnType<typeof createInterface>>
): Promise<UserRow | null> {
  const term = await rl.question('  Search (handle / DID / UUID): ');
  if (!term.trim()) return null;

  const results = await searchUsers(term);
  if (results.length === 0) {
    console.log(yellow('  No users found.'));
    return null;
  }
  if (results.length === 1) {
    console.log(green(`  Found: ${results[0].handle}`));
    return results[0];
  }

  printUserList(results);
  const pick = await rl.question(`  Select user (1–${results.length}) or 0 to cancel: `);
  const idx  = parseInt(pick, 10);
  if (!idx || idx < 1 || idx > results.length) return null;
  return results[idx - 1];
}

// ──────────────────────────────────────────────────────────────────────────────
// Main menu
// ──────────────────────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log('\n' + bold(cyan('╔══════════════════════════════════════════════════════════╗')));
  console.log(       bold(cyan('║          Skyrewall Admin CLI — User & DB Management      ║')));
  console.log(       bold(cyan('╚══════════════════════════════════════════════════════════╝')));
  console.log(dim('  DATABASE_URL: ' + (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':***@')
    : red('NOT SET'))));
  console.log(dim('  ENCRYPTION_KEY: ' + (process.env.ENCRYPTION_KEY ? '*** (set)' : red('NOT SET'))));
  console.log('');
}

function printMenu(): void {
  console.log('  ' + bold('Main Menu'));
  console.log('  ─────────────────────────────────────────────');
  console.log(`  ${bold('1')}. Search users`);
  console.log(`  ${bold('2')}. User integrity report`);
  console.log(`  ${bold('3')}. User reset  (clear password, keep account)`);
  console.log(`  ${bold('4')}. User wipe   (permanently delete user from DB)`);
  console.log('  ─────────────────────────────────────────────');
  console.log(`  ${bold('5')}. Create DB backup`);
  console.log(`  ${bold('6')}. Restore DB backup`);
  console.log('  ─────────────────────────────────────────────');
  console.log(`  ${bold('0')}. Exit`);
  console.log('');
}

async function main(): Promise<void> {
  printBanner();

  // Verify DB connectivity early
  try {
    await dbQuery('SELECT 1');
    console.log(green('  ✅  Database connection OK'));
  } catch (e) {
    console.log(red(`  ❌  Cannot connect to database: ${(e as Error).message}`));
    process.exit(1);
  }
  console.log('');

  const rl = createInterface({ input, output, terminal: true });
  rl.on('close', () => { console.log('\n' + dim('  Goodbye.')); process.exit(0); });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    printMenu();
    const choice = await rl.question('  Choose: ');

    switch (choice.trim()) {
      case '1': {
        // ── Search users ──────────────────────────────────────────────────
        const term = await rl.question('  Search term (handle / DID / UUID): ');
        const results = await searchUsers(term);
        printUserList(results);
        break;
      }

      case '2': {
        // ── Integrity report ──────────────────────────────────────────────
        const user = await pickUser(rl);
        if (!user) break;
        const report = await buildIntegrityReport(user.id);
        if (report) printReport(report);
        break;
      }

      case '3': {
        // ── User reset ────────────────────────────────────────────────────
        const user = await pickUser(rl);
        if (!user) break;
        await userReset(user.id, rl);
        break;
      }

      case '4': {
        // ── User wipe ─────────────────────────────────────────────────────
        console.log(red(bold('\n  ⛔  WARNING: User wipe is irreversible!')));
        console.log(yellow('  Consider creating a backup first (option 5).\n'));
        const user = await pickUser(rl);
        if (!user) break;
        await userWipe(user.id, rl);
        break;
      }

      case '5': {
        // ── Backup ────────────────────────────────────────────────────────
        await doBackup();
        break;
      }

      case '6': {
        // ── Restore ───────────────────────────────────────────────────────
        await doRestore(rl);
        break;
      }

      case '0':
      case 'q':
      case 'exit':
      case 'quit': {
        rl.close();
        break;
      }

      default:
        console.log(yellow('  Unknown option — please choose 0–6.\n'));
    }
  }
}

main().catch(err => {
  console.error(red('\n❌  Fatal error: ' + (err as Error).message));
  process.exit(1);
});
