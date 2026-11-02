import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const handler = (req: Request) => toNextJsHandler(auth()).POST(req);
const getHandler = (req: Request) => toNextJsHandler(auth()).GET(req);

export { getHandler as GET, handler as POST };
