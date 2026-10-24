/**
 * The Privacy Notice, in the Markdown subset descriptions use. Changing it means a new
 * LEGAL_VERSION in lib/legal.ts, which asks everyone to accept again.
 */
export const PRIVACY = `## The short version

- Muscle Memory is practice that feels like a real job, and **recording how you work is the product**. Your practice history and results are available now. Community comparisons appear only when published aggregate data is available. Model benchmarks and research publications are planned.
- You get a random handle like \`Quiet-Compiler-4821\`. We don't ask for your name or email.
- Other people never see your results next to your handle. Future community comparisons will use aggregates, such as percentiles and averages.
- We may publish **anonymised** stats and datasets. Don't want to be in them? **Go stealth** in Settings, no questions asked. (Fair warning: stealth works both ways, so you won't see other people's stats either.)
- We don't sell your personal data, and there are no ads.
- **What you do here is sent to our servers as you go**, and a copy stays in your browser. Delete your account in Settings and it's deleted on both.

That's the gist. The rest is the detail, which the law (reasonably) wants written down.

## Who we are

**rowandreason.com**, **Otsu, Shiga, Japan 520-0801**, is responsible for your data (the "controller", in GDPR-speak). Questions, requests and complaints go to **support@rowandreason.com**. A human reads it.

## What we collect

**Your account**

- Your handle. It's random, so it says nothing about you.
- Your profile answers: experience, how often you code with AI, languages, goal and editor keybindings, and where you gave them. All optional.
- Which version of these documents you accepted, and when.
- Your privacy choices, like whether you've gone stealth.

**What you do here**

- **Status changes**: which issue, from and to which status, when, whether you used the mouse or keyboard, how many issues were on your board, and whether we nudged you first.
- **Pages you view**: which page, its search and filters, the page before it, and when the page is visible, hidden, focused or resized. We can tell you switched away, never to what.
- **How you work on issues, keystroke by keystroke**: every key you press in the IDE's editors with its exact timing (arrows and shortcuts too), every edit, pastes as the text they add, cursor moves, scrolling, copies and cuts (where in the code, never your clipboard), which files and panels you open, the type errors and type hints the editor showed you, every run with its output and test results, your pull requests, the teammate comments and hints you received, and your replies.
- **Your profile answers**, each time you give one.

Keys are heard only inside the IDE's editors, never anywhere else on the page or outside it, and we never read your clipboard. Typing rhythm can tell people apart, the way handwriting can. We record it to study how people work, not to identify anyone, and we won't use it for that.
- **A random ID** for your browser, so records from the same person stay together without saying who that person is, and a secret only your browser knows, which proves that ID is yours when it sends records or asks us to delete them.

**When it reaches our servers**

- Your browser sends what's above every few seconds, plus the time it arrived. Nothing is sent before you've accepted these terms.
- The usual server logs: IP address, browser and timestamps. These are for keeping the lights on and the bots out, and we keep them for **[30]** days. Your records don't carry your IP address.

We don't collect your name, email, location or contacts, and we don't run third-party trackers. If that changes, this page changes first.

## Why we use it

The law asks for a reason (a "legal basis") for everything. Here are ours:

1. **Running the product.** Your board, your progress and suggestions for what to work on next. Community comparisons need published aggregate data; comparisons with LLMs are planned. This is the thing you signed up for. *Basis: performing our contract with you (GDPR Art. 6(1)(b)).*
2. **Making better issues.** Which issues are too hard or too easy, where people get stuck, and what to write next. *Basis: our legitimate interest in improving Muscle Memory (Art. 6(1)(f)).*
3. **Publishing anonymised data.** We think the world could use real data on how people solve engineering problems, and how that compares with LLMs. So we may publish aggregate stats and anonymised, record-level datasets. *Basis: legitimate interest (Art. 6(1)(f)), with an opt-out in Settings (going stealth).* More on how below.
4. **Security and abuse.** Spotting bots, cheating and attacks. *Basis: legitimate interest (Art. 6(1)(f)).*
5. **When the law makes us.** If we're legally required to keep or hand over something. *Basis: legal obligation (Art. 6(1)(c)).*

## Comparisons, and the LLMs

**Community comparisons require published aggregate data. Model benchmarks are planned.** No comparison is shown when data is unavailable.

When you compare yourself with other people, they're aggregates: "faster than 70% of people on this issue", never "faster than \`Sunny-Semicolon-7724\`".

Comparisons are a two-way street. If you go stealth, you're left out of everyone else's comparisons, and you don't see other people's stats in return. Comparisons with LLMs keep working, since those don't need anyone else's data.

Comparing you with LLMs doesn't involve sending your data to them. The models solve the same issues separately, and we compare the results.

## Publishing data, carefully

Before anything goes public, we strip it of anything that points back to you:

- No handles. IDs are replaced with new random ones per dataset.
- Times are coarsened, and free text you typed is removed.
- Groups too small to hide in are dropped.
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

Muscle Memory is for people **16 and older**. If you're younger, please come back in a bit; the issues will still be here.

## Changes

When this notice changes, the version at the top changes too, and you'll be asked to accept the new one on your next visit. No sneaky edits.

## Contact

**support@rowandreason.com**, or by post to **Otsu, Shiga, Japan 520-0801**.
`;
