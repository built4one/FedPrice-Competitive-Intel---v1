import crypto from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
export interface Principal { username: string; workspace: string }
declare global { namespace Express { interface Request { principal: Principal } } }
interface Account { username: string; workspace: string; passwordHash: string }
export function passwordHash(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 32).toString('hex')}`;
}
function matches(password: string, encoded: string) {
  const [salt,hash] = encoded.split(':'); if (!salt || !/^[a-f0-9]{64}$/.test(hash || '')) return false;
  const derived = crypto.scryptSync(password, salt, 32); return crypto.timingSafeEqual(derived, Buffer.from(hash,'hex'));
}
function accounts(): Account[] { try { const data = JSON.parse(process.env.STUDIO_USERS_JSON || '[]'); return Array.isArray(data) ? data.filter(x => x.username && x.workspace && x.passwordHash) : []; } catch { return []; } }
export const localMode = () => process.env.STUDIO_LOCAL_MODE === '1' && process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production';
// Owner-only testing on a specific Vercel-protected preview alias. Never applies
// to production, local servers, custom domains, or other preview aliases.
function previewOwner(req: Request): Principal | null {
  const historicalPreview=process.env.STUDIO_HISTORICAL_PREVIEW_ACCESS==='1' && ['codex/historical-testing-safeguards', 'codex/atlas-home-blue'].includes(process.env.VERCEL_GIT_COMMIT_REF || '');
  const host = historicalPreview?process.env.VERCEL_URL:process.env.STUDIO_PREVIEW_OWNER_HOST;
  if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'preview'
    || !host?.endsWith('.vercel.app') || req.headers.host !== host) return null;
  return { username: 'boss', workspace: historicalPreview?'historical-tests':'boss' };
}
export const authConfigured = () => localMode() || (accounts().length > 0 && (process.env.SESSION_SECRET?.length || 0) >= 32);
const sign = (text: string) => crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update(text).digest('base64url');


// Opt-in, link-only tester access for this single preview branch.
// A signed browser cookie maps each tester to an independent data workspace.
// No access is granted to the owner/historical workspace or production.
const guestCookieName = 'fmp_preview_guest';
const guestLifetimeSeconds = 7 * 24 * 60 * 60;
function previewGuest(req: Request, res: Response): Principal | null {
  if (process.env.STUDIO_GUEST_PREVIEW_ACCESS !== '1'
    || process.env.VERCEL !== '1'
    || process.env.VERCEL_ENV !== 'preview'
    || !['codex/atlas-team-guest-preview','codex/historical-recovery','codex/intelligence-completion'].includes(process.env.VERCEL_GIT_COMMIT_REF||'')
    || !process.env.VERCEL_URL?.endsWith('.vercel.app')
    || ![process.env.VERCEL_URL,process.env.STUDIO_TESTING_HOST].filter(Boolean).includes(req.headers.host)
    || (process.env.SESSION_SECRET?.length || 0) < 32) return null;

  const cookie = /(?:^|;\s*)fmp_preview_guest=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  let visitorId: string | null = null;
  if (cookie) {
    const separator = cookie.lastIndexOf('.');
    if (separator > 0) {
      const payload = cookie.slice(0, separator);
      const signature = cookie.slice(separator + 1);
      const expected = sign(payload);
      if (signature.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        try {
          const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
          if (typeof data.id === 'string' && /^[a-f0-9]{32}$/.test(data.id)
            && typeof data.expires === 'number' && data.expires > Date.now()) visitorId = data.id;
        } catch { /* Invalid/expired guest cookies create a fresh isolated workspace. */ }
      }
    }
  }
  if (!visitorId) {
    visitorId = crypto.randomBytes(16).toString('hex');
    const payload = Buffer.from(JSON.stringify({
      id: visitorId, expires: Date.now() + guestLifetimeSeconds * 1000,
    })).toString('base64url');
    res.append('Set-Cookie', guestCookieName + '=' + payload + '.' + sign(payload)
      + '; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=' + guestLifetimeSeconds);
  }
  return { username: 'tester', workspace: 'preview-guest-' + visitorId };
}
function principal(req: Request): Principal | null {
  const owner = previewOwner(req); if (owner) return owner;
  if (localMode() && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) return {username:'local-analyst',workspace:'local'};
  if (!authConfigured()) return null;
  const cookie = /(?:^|;\s*)fmp_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  if (!cookie) return null;
  const [body,sig] = cookie.split('.'); const expected = sign(body || '');
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
  try { const data = JSON.parse(Buffer.from(body,'base64url').toString()); if (data.expires < Date.now()) return null;
    const account = accounts().find(a => a.username === data.username && a.workspace === data.workspace);
    return account ? {username:account.username,workspace:account.workspace} : null;
  } catch { return null; }
}
export function installAuth(app: Express) {
  app.use('/api', (req,res,next) => {
    res.setHeader('Cache-Control','no-store');
    const origin=req.headers.origin;
    if (origin && !['GET','HEAD','OPTIONS'].includes(req.method)) {
      try { if(new URL(origin).host !== req.headers.host) return res.status(403).json({error:'Cross-origin writes are not allowed.'}); }
      catch { return res.status(403).json({error:'Invalid request origin.'}); }
    }
    next();
  });
  app.get('/api/session', (req,res) => {
    const guest = previewGuest(req,res);
    const owner = previewOwner(req);
    res.json({user:guest || principal(req),configured:!!guest || !!owner || authConfigured(),local:localMode(),accessMode:guest || owner ? 'vercel-preview' : 'password'});
  });
  app.post('/api/session', async (req,res) => {
    if (!authConfigured()) return res.status(503).json({error:'Private access is not configured. Set STUDIO_USERS_JSON and SESSION_SECRET on the server.'});
    const username=String(req.body?.username || '').slice(0,100); const password=String(req.body?.password || '').slice(0,1024);
    const account=accounts().find(a=>a.username===username);
    // A password hash is always evaluated, including unknown usernames.
    const valid=matches(password,account?.passwordHash || '00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000');
    if (!account || !valid) { await new Promise(r=>setTimeout(r,500)); return res.status(401).json({error:'Username or password is incorrect.'}); }
    const user={username:account.username,workspace:account.workspace};
    const body=Buffer.from(JSON.stringify({...user,expires:Date.now()+8*60*60*1000})).toString('base64url');
    res.setHeader('Set-Cookie',`fmp_session=${body}.${sign(body)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV==='production' || process.env.VERCEL==='1' ? '; Secure' : ''}`);
    res.json({user});
  });
  app.delete('/api/session', (_req,res) => { res.setHeader('Set-Cookie','fmp_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');res.json({success:true}); });
  app.use('/api', (req:Request,res:Response,next:NextFunction) => {
    if(req.path==='/health') return next();
    const user=previewGuest(req,res) || principal(req); if(!user) return res.status(authConfigured()?401:503).json({error:authConfigured()?'Sign in to continue.':'Private access is not configured.'});
    req.principal=user; next();
  });
}

