"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="loading-page"><span className="eyebrow">SOMETHING NEEDS TENDING</span><h1>Let’s try that again.</h1><button className="button primary" onClick={reset}>Reload page →</button></main>; }
