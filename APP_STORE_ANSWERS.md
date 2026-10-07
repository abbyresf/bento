# App Store Connect answers for Bento Dining

Drafted 7 Oct 2026. The age rating wording was read from Apple's documentation
on this date. The privacy label wording was read the same day. Both forms change,
so read each question as it appears and use the meaning, not the exact words.
The account holder must submit both. `ios/App/App/PrivacyInfo.xcprivacy` is the
in-app copy of the privacy answers and must say the same thing.

## Where to find them

App Store Connect, then Apps, then Bento Dining.

- **Age rating:** App Information in the left sidebar, then the Age Rating
  section, then Edit.
- **Privacy labels:** App Privacy in the left sidebar, then Get Started (or
  Edit), and a Privacy Policy URL on the same page.
- **Privacy policy URL:** the live `/privacy` page on bentodining.com.

Both can be changed at any time without a new build. Both must be complete
before a version can be submitted for review.

## Age rating

| Question | Answer | Why |
| --- | --- | --- |
| Parental Controls | No | None in the app |
| Age Assurance | No | Age is asked for calorie math, not to gate anything |
| Unrestricted Web Access | No | The app opens fixed pages only |
| User-Generated Content | **Yes** | Students post suggestions that other students see |
| Social Media | No | No profiles, feeds of people or following. **Revisit if friends or communities ship** |
| Messaging and Chat | No | No student to student messages |
| Advertising | No | No ads |
| Profanity or Crude Humor | None | |
| Horror or Fear Themes | None | |
| Alcohol, Tobacco or Drug Use | None | |
| Medical or Treatment Information | None | Bento shows nutrition and allergen flags, not treatment |
| Health or Wellness Topics | **Yes** | Nutrition targets, dietary restrictions |
| Mature or Suggestive Themes | None | |
| Sexual Content or Nudity | None | |
| Graphic Sexual Content | None | |
| Cartoon or Fantasy Violence | None | |
| Realistic Violence | None | |
| Prolonged Graphic Violence | None | |
| Guns or Other Weapons | None | |
| Gambling | None | |
| Simulated Gambling | None | |
| Contests | None | Quests are personal goals, not contests |
| Loot Boxes | None | Closet pieces are earned, never random or bought |

**Expected result: 9+**, driven by the health and wellness answer. **Decision,
7 Oct 2026: set it to 13+**, to match the privacy policy, which says Bento is not
directed to children under 13. Apple lets you set a higher minimum age than the
questionnaire gives: in the Age Rating section, choose the higher rating after
answering the questions.

**User-generated content brings guideline 1.2.** A reviewer can ask for a way to
report content, a way to block abusive users, filtering, and published contact
details. Today there is a flag button on suggestions and a support page.
Suggestions are anonymous, so blocking a user does not apply to them. Be ready
to explain that. Communities with replies would raise the bar a lot.

## Privacy labels

"Collect data" is the first question. Answer **Yes**.

Every type below is **linked to the student's account** and **not used to track**.
Bento has no ad networks and combines nothing with other companies' data.
BentoPulse clients see aggregates only, so nothing is "shared with third parties".

| Data type | Category in the form | Purposes |
| --- | --- | --- |
| Email address | Contact Info, Email Address | App Functionality |
| User ID | Identifiers, User ID | App Functionality |
| Push token | Identifiers, Device ID | App Functionality |
| Dietary restrictions, allergies, weight, height, age, sex, nutrition targets | Health & Fitness, Health | App Functionality, Product Personalization |
| Meal confirmations, ratings, streaks, quests | Usage Data, Product Interaction | App Functionality, Analytics |
| Suggestions, survey answers | User Content, Other User Content | App Functionality, Analytics |
| Feedback messages with an optional reply email | User Content, Customer Support | App Functionality |

Not collected, so leave unticked: name, phone, address, location, contacts,
photos, search history, purchases, financial info, sensitive info, advertising
data, crash logs and diagnostics.

Two judgement calls to confirm:

- **Analytics** is selected for interactions and survey answers because Pulse
  turns them into aggregate counts. That is the honest reading.
- If crash monitoring is added later, add **Diagnostics, Crash Data** here and in
  the manifest.

## The privacy policy page

Updated 7 Oct 2026 to match the labels above. It now lists what is collected
(body measurements, quests, the mascot piece, survey answers, notification
tokens), names the services that handle data (Supabase, Vercel, Apple, Google,
EmailJS for the website contact form), describes notifications, and says plainly
what survives account deletion: anonymous suggestions, and feedback messages and
university requests with the link to the account removed.

## Keep these in step

Change one of: the manifest, these answers, the privacy policy page. Then change
the other two.
