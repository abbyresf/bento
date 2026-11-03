# Bento design direction (draft for approval)

Written 3 Nov 2026 from screenshots of every main screen in the mock app at phone width. Nothing is changed in
the app yet. This is the plan and the choices I need from you.

## 1. What makes the app feel generic and choppy

Taken from the screens, not from taste.

1. **One shape everywhere.** Today, Buddies, Insights, Community and Ratings are all white rounded rectangles on cream.
   Today alone stacks five of them (progress, breakfast, lunch, dinner, plus the dish cards inside dinner). There is no
   card that says this is the important one. The result reads as a template.
2. **Cards inside cards.** A section card holds quest cards (Buddies). The dinner card holds dish cards, and each dish card
   carries up to six lines: name, serving chip, an orange reason line, three to four tag pills, a macro line, a stepper.
3. **Too many jobs for one color.** Orange is the main action, the star rating, a progress bar, a reason line, and an
   active tab. Green is progress and "confirmed". Blue appears on the Community banner and Dairy-Free pills. Nothing
   tells the eye what to do next.
4. **Four different page headers.** Today has the logo, date and gear. Buddies has a plain title. Insights has a title
   with a close X on a tab you cannot close. Community opens with a blue banner. Each tab feels like a different app.
5. **One typeface.** The app is Nunito at different weights. The website uses Fraunces (a warm display serif) with Instrument
   Sans, and its headline with the orange italic underline is the most Bento thing in the whole product. The app never
   uses it, so the site and the app look like two brands.
6. **The mascot is a sticker, not a character.** Bento speaks on Today, appears as a small avatar on Buddies, and sits in a
   card on Insights. Everywhere else there is nothing. The best asset is used least.
7. **Motion exists but is rare.** `motion.css` already has springs, a rise-in, a pop-in and staggered delays, but tabs cut
   instantly (they are hidden and shown), progress bars are drawn finished, confirming a meal has no moment, and loading is a
   plain spinner.
8. **Fonts load from Google on every launch**, including inside the iPhone app, through a stylesheet import that blocks
   text. Offline or on slow wifi the app flashes in a fallback font.

## 2. The idea: the app is a packed bento box

The logo is already a lunchbox: an orange circle, a fern block and a cream strip, held in a navy frame. The mascot is
drawn the same way, with thick navy outlines and flat color. The interface should speak that language.

- **Compartments instead of cards.** Each screen is one or two big compartments with a navy ink outline, not a stack of
  twelve white boxes. Rows inside a compartment are separated by hairlines, not by more boxes.
- **Ink and paper.** Cream paper ground, navy ink for text and outlines, flat fills. Soft shadows go away. The ink outline
  is used for hero elements only (the day, the current quest, the plate being built), so it stays special.
- **Each food group has its place.** Orange, fern and cream are the three compartment colors from the logo, used as
  fills in the day view and the plate view. Orange as an action button stays, but it stops being used for anything else.

## 3. System

**Type.** Fraunces for display: screen titles, meal names, big numbers (calories, streak days). A clean sans for everything
else. I recommend Instrument Sans so the site and the app match, and bundling both files in the app so nothing loads from
Google. This also removes a third-party call from the App Store privacy picture.

**Color roles.** Navy: text and ink. Orange: the one action color. Fern: progress and "done". A warm gold for stars. Cream
and butter: surfaces. Blue is removed, and tag pills become one quiet neutral with a small icon. Dark mode keeps working
through the existing tokens.

**One of each.** One Page Header (title, optional mascot pose and one-line voice, optional action), one Compartment, one Row,
one Sheet, one Button set. Today's four header styles collapse to one.

**Mascot as the voice.** Each tab header has a pose and a line. Empty states, errors, loading and confirmation all use Bento
instead of a spinner or plain text: Bento hopping while a menu loads, the lid closing when a meal is confirmed, Bento
napping when a hall is closed.

**Motion.** One language, built on the tokens that exist:
- Tabs cross-slide instead of cutting, and each tab's content rises in with the existing stagger.
- Progress bars and the day view fill when they appear.
- Confirming a meal closes a compartment lid with a haptic and a short confetti only on streak milestones.
- A plan expands from the meal that was tapped, not as a new block.
- Sheets use the same spring everywhere. Reduced motion stays honored.

## 4. Layout changes that matter more than polish

**Today.** Replace the progress card plus three meal cards with one **day box**: a bento silhouette with breakfast, lunch and
dinner as three compartments that fill in as meals are confirmed, with the day's calories and protein as two big Fraunces
numbers above it. Tapping a compartment opens that meal's plan in place. The open plan becomes a single list of dishes with
one quiet line each (name, serving, macros) and the tag and reason details one tap away, not always on screen.

**Buddies.** Out Now becomes a strip of Bento avatars wearing their outfits. Quests become a horizontal set of three large
cards with the quest's pet icon drawn in the app's own style instead of emoji, with the claim action on the card.

**Insights.** Remove the close X. The streak and badge box sit on top as the hero. The week's numbers become the same big
number style as Today.

**Community, Ratings, Settings.** Same header, same Row, same spacing. Community loses the blue banner and gets a quieter
guidelines link.

## 5. How to do it without breaking things

The CSS is about 15,000 lines across 40 files, so I would change it from the bottom up:
1. **Foundations.** Bundle fonts, add the new tokens, build Header, Compartment, Row and Sheet. No screen changes yet.
2. **Today.** The day box and the plan list. This is the pilot, and the screen you see most.
3. **Buddies and quests.**
4. **Insights, Ratings, Community, Settings.**
5. **Onboarding and auth,** brought to the same system, and the landing page checked against it.
6. **Motion and mascot moments** as a final pass, with the iPhone haptics.

Each phase is testable in the mock app with before and after screenshots, and each can ship on its own. The existing 305
tests stay green, and I would add checks for the new tokens (no blue, no pure white, the contrast of each role).

## 6. Decisions I need from you

1. **Typeface.** Fraunces plus Instrument Sans in the app, matching the site. Yes or no?
2. **How bold is the ink outline?** A thick navy outline on hero elements only (my recommendation), on every compartment, or
   a hairline version that is closer to what you have now?
3. **Today redesign.** Replace the three meal cards and the progress card with the day box described above?
4. **Pilot first.** Do Phase 1 and Phase 2 (foundations plus Today), then check it on your phone before the rest?
5. **Release.** Does this go into 1.3, with 1.2.2 shipped first or held?
