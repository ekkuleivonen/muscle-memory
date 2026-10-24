/**
 * The Privacy Notice, in the Markdown subset descriptions use. Changing it means a new
 * LEGAL_VERSION in lib/legal.ts, which asks everyone to accept again.
 */
export const PRIVACY = `## The short version

- Muscle Memory is practice that feels like a real job, and **recording how you work is the product**. It's how we pick your next issues, show how you compare with other people and LLMs, and figure out which issues are any good.
- You get a random handle like \`Quiet-Compiler-4821\`. We don't ask for your name or email.
- Other people never see your results next to your handle. They see you as part of the crowd: percentiles, averages, that sort of thing.
- We may publish **anonymised** stats and datasets. Don't want to be in them? There's a switch in Settings, no questions asked.
- We don't sell your personal data, and there are no ads.
- **Today, everything stays in your browser.** We're building the bit that syncs it to our servers. This notice already covers that, so nobody gets surprised later.

That's the gist. The rest is the detail, which the law (reasonably) wants written down.

## Who we are

**[Company name]**, **[address]**, is responsible for your data (the "controller", in GDPR-speak). Questions, requests and complaints go to **[privacy@example.com]**. A human reads it.

## What we collect

**Your account**

- Your handle. It's random, so it says nothing about you.
- Your setup answers: experience, languages, goal and editor keybindings. All optional.
- Which version of these documents you accepted, and when.
- Your privacy choices, like opting out of published datasets.

**What you do here**

- **Status changes**: which issue, from and to which status, when, whether you used the mouse or keyboard, how many issues were on your board, and whether we nudged you first.
- **Work on issues**: the code you write and run, test results, which hints you saw, and timings.
- **A random ID** for your browser, so records from the same person stay together without saying who that person is.

**Once accounts sync to our servers**

- The usual server logs: IP address, browser and timestamps. These are for keeping the lights on and the bots out, and we keep them for **[30]** days.

We don't collect your name, email, location or contacts, and we don't run third-party trackers. If that changes, this page changes first.

## Why we use it

The law asks for a reason (a "legal basis") for everything. Here are ours:

1. **Running the product.** Your board, your progress, suggesting what to work on next, and comparing you with others and with LLMs. This is the thing you signed up for. *Basis: performing our contract with you (GDPR Art. 6(1)(b)).*
2. **Making better issues.** Which issues are too hard or too easy, where people get stuck, and what to write next. *Basis: our legitimate interest in improving Muscle Memory (Art. 6(1)(f)).*
3. **Publishing anonymised data.** We think the world could use real data on how people solve engineering problems, and how that compares with LLMs. So we may publish aggregate stats and anonymised, record-level datasets. *Basis: legitimate interest (Art. 6(1)(f)), with an opt-out in Settings.* More on how below.
4. **Security and abuse.** Spotting bots, cheating and attacks. *Basis: legitimate interest (Art. 6(1)(f)).*
5. **When the law makes us.** If we're legally required to keep or hand over something. *Basis: legal obligation (Art. 6(1)(c)).*

## Comparisons, and the LLMs

When you compare yourself with other people, they're aggregates: "faster than 70% of people on this issue", never "faster than \`Sunny-Semicolon-7724\`".

Comparing you with LLMs doesn't involve sending your data to them. The models solve the same issues separately, and we compare the results.

## Publishing data, carefully

Before anything goes public, we strip it of anything that points back to you:

- No handles. IDs are replaced with new random ones per dataset.
- Times are coarsened, and free text you typed is removed.
- Groups too small to hide in are dropped.
- Record-level releases get an extra review before they go out.

Data that's genuinely anonymous isn't personal data any more, and once published it can't be recalled. That's exactly why you can opt out beforehand: tick **Exclude my data from published datasets** in Settings. It covers future releases, including anything built from what you've already done.

## Who else sees it

- **Service providers** who run things for us, like hosting, under contracts that limit them to doing just that: **[list, once there is one]**.
- **Authorities**, if the law requires it.
- **Everyone**, but only the anonymised datasets described above.

That's the list. No data brokers, no advertisers.

## How long we keep it

- **Your account and activity**: for as long as you have an account. Delete it and it's gone. Today that's immediate, since it all lives in your browser. Once we have servers, we'll delete it within **[30]** days, plus backups rolling off.
- **Server logs**: **[30]** days.
- **Published anonymised datasets** stay published. They aren't linked to you, so there's nothing to delete them by.

## Your rights

Depending on where you live (the EU and UK in particular), you can ask us to:

- show you what we have (access), fix it, or delete it;
- give it to you in a portable format;
- stop using it for something, which you can call **objecting** (the publishing switch is the one-click version);
- restrict what we do with it while we sort out a disagreement.

Email **[privacy@example.com]**. We'll reply within a month. You can also complain to your data protection authority. We'd rather you talked to us first, but it's your call.

Today you can do most of this yourself: **Settings → Danger zone** resets your progress or deletes your account, and clearing your browser storage does the same, rather less politely.

## Where it's stored

Today: your browser, on your device. Later: **[region / provider]**. If data leaves the EU/EEA, we'll use the standard legal safeguards and say so here.

## Age

Muscle Memory is for people **16 and older**. If you're younger, please come back in a bit; the issues will still be here.

## Changes

When this notice changes, the version at the top changes too, and you'll be asked to accept the new one on your next visit. No sneaky edits.

## Contact

**[privacy@example.com]**, or by post to **[address]**.
`;
