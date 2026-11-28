/**
 * Prints a new VAPID key pair for Web Push: `pnpm push:keys`. Put the three lines into Vercel (Production) and
 * `.env.local`; never commit them. A new pair invalidates every device already subscribed with the old one.
 */
import { generateVAPIDKeys } from 'web-push';

const { publicKey, privateKey } = generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:<email của bạn>');
