/**
 * The Privacy Notice, in the Markdown subset descriptions use. Changing it means a new
 * LEGAL_VERSION in lib/legal.ts, which asks everyone to accept again.
 */
export const PRIVACY = `## The short version

- Muscle Memory is coding practice without AI, and **recording how you work is the product**: we study how people write code. Your progress and results are yours now; community comparisons, model benchmarks and research publications are planned.
- You're a random ID in your browser. We don't ask for your name or email.
- Other people never see your results. Future community comparisons will use aggregates, such as percentiles and averages.
- We may publish **anonymised** stats and datasets. Don't want to be in them? **Go stealth** in Settings, no questions asked. (Fair warning: stealth works both ways, so you won't see other people's stats either.)
- We don't sell your personal data, and there are no ads.
- **What you do here is sent to our servers as you go**, and your browser keeps what practice needs (your latest attempt at each challenge). Delete your account in Settings and it's deleted on both.

That's the gist. The rest is the detail, which the law (reasonably) wants written down.

## Who we are

**rowandreason.com**, **Otsu, Shiga, Japan 520-0801**, is responsible for your data (the "controller", in GDPR-speak). Questions, requests and complaints go to **support@rowandreason.com**. A human reads it.

## What we collect

**Your account**

- Your profile answers, all optional: experience, what you do, how you learned to code, where you code, languages, how often and for what you use AI, roughly how much of your shipped code an AI wrote, your goal, whether you touch type, an age band, and editor keybindings, and where you gave them.
- Which version of these documents you accepted, and when.
- Your privacy choices, like whether you've gone stealth.

**What you do here**

- **Starting a challenge**: which one, where you started it from (the list, quick start, a link, a suggestion), and for a pick from the list, your search and its place in the list. Stars too.
- **Pages you view**: which page, its search and filters, the page before it, and when the page is visible, hidden, focused or resized. We can tell you switched away, never to what.
- **How you work on challenges, keystroke by keystroke**: every key you press in the editor with its exact timing and which physical key it was (arrows and shortcuts too), every edit, pastes as the text they add, cursor moves, scrolling, copies and cuts (where in the code, never your clipboard), text you copy from the challenge itself, the type errors and type hints the editor showed you, every run with its output and results, each submission's result and the rules it broke, completing, and your answers to the questions after completing.
- **Your setup, coarsely**: browser and operating system family, mouse or touch, language, time zone, what a few keys on your keyboard type (its layout), and whether the browser says it is being driven by automation rather than a person. Never your exact browser version or anything that singles out your device.
- **Your profile answers**, each time you give one.

Keys are heard only inside the editor, never anywhere else on the page or outside it, and we never read your clipboard. Typing rhythm can tell people apart, the way handwriting can. We record it to study how people work, not to identify anyone, and we won't use it for that.
- **A random ID** for your browser, so records from the same person stay together without saying who that person is, and a secret only your browser knows, which proves that ID is yours when it sends records or asks us to delete them.

**When it reaches our servers**

- Your browser sends what's above every few seconds, plus the time it arrived. Nothing is sent before you've accepted these terms.
- **The country your connection comes from**, as our hosting provider places it (Finland, say), stored with your records so we can compare how practice differs between countries. Only the country: never your city, and never your IP address. A VPN or travel can make it wrong, and that's fine.
- The usual server logs: IP address, browser and timestamps. These are for keeping the lights on and the bots out, and we keep them for **[30]** days. Your records don't carry your IP address.

We don't collect your name, email, precise location or contacts, and we don't run third-party trackers. If that changes, this page changes first.

## Why we use it

The law asks for a reason (a "legal basis") for everything. Here are ours:

1. **Running the product.** Your progress, stars, result cards and suggestions for what to work on next. This is the thing you signed up for. *Basis: performing our contract with you (GDPR Art. 6(1)(b)).*
2. **Making better challenges.** Which challenges are too hard or too easy, where people get stuck, and what to write next. *Basis: our legitimate interest in improving Muscle Memory (Art. 6(1)(f)).*
3. **Publishing anonymised data.** We think the world could use real data on how people solve engineering problems, and how that compares with LLMs. So we may publish aggregate stats and anonymised, record-level datasets. *Basis: legitimate interest (Art. 6(1)(f)), with an opt-out in Settings (going stealth).* More on how below.
4. **Security and abuse.** Spotting bots, cheating and attacks. *Basis: legitimate interest (Art. 6(1)(f)).*
5. **When the law makes us.** If we're legally required to keep or hand over something. *Basis: legal obligation (Art. 6(1)(c)).*

## Comparisons, and the LLMs

**Community comparisons and model benchmarks are planned.** Nothing compares you with anyone yet.

When they come, comparisons with other people will be aggregates: "faster than 70% of people on this challenge", never "faster than \`Sunny-Semicolon-7724\`".

Comparisons are a two-way street. If you go stealth, you're left out of everyone else's comparisons, and you don't see other people's stats in return. Comparisons with LLMs keep working, since those don't need anyone else's data.

Comparing you with LLMs doesn't involve sending your data to them. The models solve the same challenges separately, and we compare the results.

## Publishing data, carefully

Before anything goes public, we strip it of anything that points back to you:

- IDs are replaced with new random ones per dataset.
- Times are coarsened, and free text you typed is removed.
- Groups too small to hide in are dropped, for example a country with only a few people in it.
- Record-level releases get an extra review before they go out.

Data that's genuinely anonymous isn't personal data any more, and once published it can't be recalled. That's exactly why you can opt out beforehand: **go stealth** with \`privacy\` in Settings. It covers future releases, including anything built from what you've already done.

## Who else sees it

- **Service providers** who run things for us, like hosting, under contracts that limit them to doing just that: **[list, once there is one]**.
- **Authorities**, if the law requires it.
- **Everyone**, but only the anonymised datasets described above.

That's the list. No data brokers, no advertisers.

## How long we keep it

- **Your account and activity**: for as long as you have an account. Delete it and your browser's copy goes at once, our servers stop accepting anything from it straight away, and what they hold is erased within **[30]** days, plus backups rolling off.
- **Server logs**: **[30]** days.
- **Published anonymised datasets** stay published. They aren't linked to you, so there's nothing to delete them by.

## Your rights

Depending on where you live (the EU and UK in particular), you can ask us to:

- show you what we have (access), fix it, or delete it;
- give it to you in a portable format;
- stop using it for something, which you can call **objecting** (going stealth is the one-command version);
- restrict what we do with it while we sort out a disagreement.

Email **support@rowandreason.com**. We'll reply within a month. You can also complain to your data protection authority. We'd rather you talked to us first, but it's your call.

You can do most of this yourself: \`delete\` in **Settings** deletes your account here and on our servers. \`reset\` only clears your progress in this browser; what was already sent stays until you delete your account. Clearing your browser storage throws away the secret that proves the records are yours, so delete your account first, or email us.

## Where it's stored

In your browser, and on Cloudflare (our hosting and storage provider), in **[hosting region to be confirmed]**. Uploads do not provide account recovery, a backup or device sync. If data leaves the EU/EEA, we'll use the standard legal safeguards and say so here.

## Age

Muscle Memory is for people **16 and older**. If you're younger, please come back in a bit; the challenges will still be here.

## Changes

When this notice changes, the version at the top changes too, and you'll be asked to accept the new one on your next visit. No sneaky edits.

## Contact

**support@rowandreason.com**, or by post to **Otsu, Shiga, Japan 520-0801**.
`;
