/** Left half of the sign-in screens: a short, plain headline. */
export function SignInHero({ lead }: { readonly lead: string }) {
  return (
    <div className="max-w-[480px]">
      <p className="text-[12.5px] font-semibold tracking-[0.2em] text-muted uppercase">
        AI voice agents · Built in India
      </p>
      <p className="mt-4 text-[36px] leading-[1.1] font-extrabold tracking-[-0.03em] text-ink sm:text-[44px]">
        {lead} <span className="text-accent">better conversations.</span>
      </p>
      <p className="mt-5 text-[16px] leading-relaxed text-muted sm:text-[17px]">
        Manage your AI calls, qualify leads, and turn conversations into outcomes.
      </p>
    </div>
  );
}
