import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Inngest authenticates its own webhook requests with INNGEST_SIGNING_KEY.
// It must remain reachable without a Clerk user session.
const isInngestRoute = createRouteMatcher(['/api/inngest(.*)']);

const isProtectedApiRoute = createRouteMatcher([
  '/api/itinerary-jobs(.*)',
  '/api/trips/(.*)/itinerary-jobs(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isInngestRoute(req)) return;

  if (isProtectedApiRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
