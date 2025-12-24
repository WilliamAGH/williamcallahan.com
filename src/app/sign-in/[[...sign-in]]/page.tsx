/**
 * Sign-In Page
 *
 * Clerk authentication sign-in page using catch-all routing for multi-step flows.
 * The [[...sign-in]] pattern allows Clerk to handle SSO callbacks, MFA, etc.
 *
 * @see https://clerk.com/docs/references/nextjs/custom-sign-in-page
 */

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
      />
    </main>
  );
}
