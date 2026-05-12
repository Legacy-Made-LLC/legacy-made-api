#!/usr/bin/env node
/**
 * Legacy Made admin CLI — thin wrapper over the `/admin` REST endpoints
 * guarded by `SystemAdminGuard`. Auth is via Bearer token from
 * `LM_ADMIN_TOKEN` (a Clerk session JWT for a user with
 * `users.is_system_admin = true`).
 *
 * Usage: see ../README.md.
 *
 * Run via:  npm run admin -- <command> [flags]
 * (the `npm run admin --` ensures flags pass through to argv intact).
 */
import { argv, env, exit, stderr, stdout } from 'node:process';

type Argv = { _: string[]; flags: Record<string, string | boolean> };

function parseArgv(args: string[]): Argv {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { _: positional, flags };
}

function requireFlag(flags: Argv['flags'], name: string): string {
  const v = flags[name];
  if (typeof v !== 'string' || v.length === 0) {
    die(`Missing required flag: --${name}`);
  }
  return v;
}

function optionalFlag(flags: Argv['flags'], name: string): string | undefined {
  const v = flags[name];
  return typeof v === 'string' ? v : undefined;
}

function boolFlag(flags: Argv['flags'], name: string): boolean {
  const v = flags[name];
  if (v === true) return true;
  if (typeof v === 'string') return v === 'true';
  return false;
}

function die(msg: string): never {
  stderr.write(`error: ${msg}\n`);
  exit(1);
}

function getConfig() {
  const baseUrl = env.LM_API_URL?.replace(/\/$/, '');
  const token = env.LM_ADMIN_TOKEN;
  if (!baseUrl) die('LM_API_URL is not set');
  if (!token) die('LM_ADMIN_TOKEN is not set');
  return { baseUrl, token };
}

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { baseUrl, token } = getConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const parsed = await res.json();
      detail =
        typeof parsed === 'object' && parsed !== null
          ? JSON.stringify(parsed)
          : String(parsed);
    } catch {
      detail = await res.text();
    }
    die(`${method} ${path} → ${res.status} ${res.statusText}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function out(value: unknown) {
  stdout.write(JSON.stringify(value, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdPing() {
  out(await api('GET', '/admin/ping'));
}

async function cmdLookupUser({ flags }: Argv) {
  const email = requireFlag(flags, 'email');
  out(
    await api(
      'GET',
      `/admin/users/by-email?email=${encodeURIComponent(email)}`,
    ),
  );
}

async function cmdCreateMasterSub({ flags }: Argv) {
  const ownerEmail = requireFlag(flags, 'owner-email');
  const owner = await api<{ id: string }>(
    'GET',
    `/admin/users/by-email?email=${encodeURIComponent(ownerEmail)}`,
  );
  const body = {
    ownerUserId: owner.id,
    displayName: requireFlag(flags, 'display-name'),
    seatLimit: Number(requireFlag(flags, 'seats')),
    tier: optionalFlag(flags, 'tier') ?? 'individual',
    ownerConsumesSeat: boolFlag(flags, 'owner-consumes-seat'),
    currentPeriodEnd: optionalFlag(flags, 'period-end') ?? null,
  };
  out(await api('POST', '/admin/master-subscriptions', body));
}

async function cmdListMasterSubs() {
  out(await api('GET', '/admin/master-subscriptions'));
}

async function cmdShowMasterSub({ flags }: Argv) {
  const id = requireFlag(flags, 'id');
  out(await api('GET', `/admin/master-subscriptions/${id}`));
}

async function cmdListMembers({ flags }: Argv) {
  const id = requireFlag(flags, 'id');
  out(await api('GET', `/admin/master-subscriptions/${id}/members`));
}

async function cmdRemoveMember({ flags }: Argv) {
  const memberId = requireFlag(flags, 'member-id');
  out(await api('DELETE', `/admin/master-subscription-members/${memberId}`));
}

async function cmdSetStatus({ flags }: Argv) {
  const id = requireFlag(flags, 'id');
  const status = requireFlag(flags, 'status');
  out(await api('PATCH', `/admin/master-subscriptions/${id}`, { status }));
}

async function cmdSetSeats({ flags }: Argv) {
  const id = requireFlag(flags, 'id');
  const seatLimit = Number(requireFlag(flags, 'seats'));
  out(await api('PATCH', `/admin/master-subscriptions/${id}`, { seatLimit }));
}

async function cmdSetPeriodEnd({ flags }: Argv) {
  const id = requireFlag(flags, 'id');
  const date = optionalFlag(flags, 'date') ?? null;
  out(
    await api('PATCH', `/admin/master-subscriptions/${id}`, {
      currentPeriodEnd: date,
    }),
  );
}

async function cmdInvite({ flags }: Argv) {
  const id = requireFlag(flags, 'id');
  const email = requireFlag(flags, 'email');
  out(
    await api('POST', `/admin/master-subscriptions/${id}/invites`, { email }),
  );
}

const COMMANDS: Record<string, (a: Argv) => Promise<void>> = {
  ping: cmdPing,
  'lookup-user': cmdLookupUser,
  'create-master-sub': cmdCreateMasterSub,
  'list-master-subs': cmdListMasterSubs,
  'show-master-sub': cmdShowMasterSub,
  'list-members': cmdListMembers,
  'remove-member': cmdRemoveMember,
  'set-status': cmdSetStatus,
  'set-seats': cmdSetSeats,
  'set-period-end': cmdSetPeriodEnd,
  invite: cmdInvite,
};

function help(): never {
  stdout.write(
    [
      'Legacy Made admin CLI',
      '',
      'Environment:',
      '  LM_API_URL       Base URL of the API (e.g. https://api.legacymade.app)',
      '  LM_ADMIN_TOKEN   Clerk session JWT for a user with is_system_admin = true',
      '',
      'Commands:',
      '  ping',
      '  lookup-user        --email <e>',
      '  create-master-sub  --owner-email <e> --display-name <n> --seats <n> [--tier individual] [--owner-consumes-seat] [--period-end <iso>]',
      '  list-master-subs',
      '  show-master-sub    --id <id>',
      '  list-members       --id <id>',
      '  remove-member      --member-id <id>',
      '  set-status         --id <id> --status <active|past_due|suspended|cancelled>',
      '  set-seats          --id <id> --seats <n>',
      '  set-period-end     --id <id> [--date <iso>]',
      '  invite             --id <id> --email <e>',
      '',
    ].join('\n'),
  );
  exit(0);
}

async function main() {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    help();
  }
  const [cmd, ...rest] = args;
  const handler = COMMANDS[cmd];
  if (!handler) die(`Unknown command: ${cmd}\n(Run with --help for usage)`);
  await handler(parseArgv(rest));
}

main().catch((err) => {
  stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  exit(1);
});
