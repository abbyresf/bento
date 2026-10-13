import { SHEETS, AUDIT_SHEET } from './sheets.js';

/* What every column means and where it comes from. It is a sheet in the workbook
 * export, so a file passed on to someone who has never seen Bento still explains
 * itself. A test checks that every column on every sheet has an entry here, and
 * that nothing here is left over from a column that was removed. */

const CODE = { source: 'Bento, at enrolment', meaning: 'The participant code, P-001 onward, issued in the order students enrolled. The key in every sheet.' };
const GRP = { source: 'Bento, at enrolment', meaning: 'S is the snack group (PRELOAD) and L is the loop and plan group. Assigned by Bento when the person enrolled (each two people in order of arrival get one of each) and never changed.' };
const DELETED = { source: 'App, when the student undoes a confirmation', meaning: 'When the student undid this confirmation. The row is kept and marked.' };

export const DICTIONARY = {
  participants: {
    participant_code: CODE, grp: GRP,
    status: { source: 'Bento', meaning: 'active, completed (the window ran out) or withdrawn. Final once it is not active.' },
    full_name: { source: "The researchers' list", meaning: 'The name the researchers gave for this person. May be empty.' },
    email: { source: 'The Bento account', meaning: 'The email on the participant\'s Bento account when they enrolled. Copied at enrolment, so it stays if the account is deleted.' },
    enrolled_at: { source: 'Bento', meaning: 'When they entered the code and confirmed. Collection starts here.' },
    window_ends_at: { source: 'Bento', meaning: 'When their study window ends. 21 days after enrolment unless extended.' },
    withdrawn_at: { source: 'Bento', meaning: 'When they chose to leave. Empty if they did not.' },
    acknowledged_at: { source: 'App', meaning: 'When they ticked that they completed the consent form and are 18 or over.' },
    platform: { source: 'App', meaning: 'The platform they enrolled from. Always ios.' },
    push_status: { source: 'Bento, refreshed on every reminder run', meaning: 'on if the device can receive the study reminders, off if not. Off means the intervention reminder could not reach them.' },
    install_state: { source: 'Reserved', meaning: 'Reserved for later. Not used in this study yet.' },
  },
  roster: {
    email: { source: "The researchers' list", meaning: 'The email the list matches a Bento account by.' },
    full_name: { source: "The researchers' list", meaning: 'The name on the list. May be empty.' },
    enrolled: { source: 'Bento', meaning: 'Whether this person has entered the code and enrolled.' },
    participant_code: CODE,
    participant_status: { source: 'Bento', meaning: 'Their status once enrolled. Empty if they have not.' },
    added_at: { source: "The researchers' list", meaning: 'When this row was loaded into Bento.' },
    claimed_at: { source: 'Bento', meaning: 'When they enrolled against this row.' },
  },
  responses: {
    participant_code: CODE, grp: GRP,
    for_date: { source: 'Bento', meaning: 'The day the questions were for, in Eastern time.' },
    late: { source: 'Bento', meaning: 'Answered on a later day than it was for. A missed survey is offered once more the next day.' },
    submitted_at: { source: 'App', meaning: 'When the answers were sent.' },
    question_position: { source: "The researchers' survey", meaning: 'Where the question sits in the survey.' },
    question_text: { source: "The researchers' survey", meaning: 'The exact wording the participant saw. A changed question is a new row, so a wording never mixes two questions.' },
    question_format: { source: "The researchers' survey", meaning: 'yes_no, rating (1 to 5), multiple_choice or short_answer.' },
    answer_text: { source: 'App', meaning: 'The answer as plain text: Yes or No, a number from 1 to 5, the option chosen, or the words typed. A follow-up that was not shown has no row.' },
  },
  meals: {
    participant_code: CODE, grp: GRP,
    meal_date: { source: 'App', meaning: 'The day of the meal, in Eastern time.' },
    meal_type: { source: 'App', meaning: 'breakfast, lunch or dinner.' },
    dining_hall: { source: 'App', meaning: 'The hall the plate was built from. Empty for older plates.' },
    confirmed_at: { source: 'App', meaning: 'When the student confirmed the plate. Bento knows what they confirm, not what they eat.' },
    item_count: { source: 'App', meaning: 'How many items were on the plate.' },
    consumption_reported_at: { source: 'App', meaning: 'The first time they said how much of the plate they ate. Empty if they never did. Counts as a waste report.' },
    deleted_at: DELETED,
  },
  plate_items: {
    participant_code: CODE, grp: GRP,
    meal_date: { source: 'App', meaning: 'The day of the meal, in Eastern time.' },
    meal_type: { source: 'App', meaning: 'breakfast, lunch or dinner.' },
    dining_hall: { source: 'App', meaning: 'The hall the plate was built from.' },
    item_position: { source: 'App', meaning: 'The item\'s place on the plate.' },
    item_name: { source: 'The dining hall menu', meaning: 'The dish name as published that day.' },
    servings: { source: 'App', meaning: 'How many servings the student took.' },
    consumed: { source: 'App', meaning: 'The share of what they took that they say they ate, from 0 to 1. Empty means they did not answer, not that they ate none.' },
    calories: { source: 'The dining hall menu', meaning: 'Calories per serving as published.' },
    protein: { source: 'The dining hall menu', meaning: 'Protein in grams per serving as published.' },
    carbs: { source: 'The dining hall menu', meaning: 'Carbohydrate in grams per serving as published.' },
    fat: { source: 'The dining hall menu', meaning: 'Fat in grams per serving as published.' },
    deleted_at: DELETED,
  },
  snapshots: {
    participant_code: CODE, grp: GRP,
    taken_at: { source: 'Bento', meaning: 'When this version of their profile was saved. A change adds a row and keeps the old one.' },
    reason: { source: 'Bento', meaning: 'enrolment (the first), profile, targets or restrictions: what changed.' },
    university: { source: 'App', meaning: 'The school they chose in the app.' },
    weight: { source: 'App', meaning: 'Self-reported weight, in the unit beside it.' },
    weight_unit: { source: 'App', meaning: 'The unit the weight is in: lbs or kg.' },
    height_feet: { source: 'App', meaning: 'Self-reported height, feet.' },
    height_inches: { source: 'App', meaning: 'Self-reported height, inches.' },
    age: { source: 'App', meaning: 'Self-reported age.' },
    sex: { source: 'App', meaning: 'Self-reported, used for the calorie estimate.' },
    activity_level: { source: 'App', meaning: 'Self-reported activity level.' },
    goal: { source: 'App', meaning: 'Their goal: lose, maintain or gain.' },
    skip_breakfast: { source: 'App', meaning: 'Whether they said they skip breakfast at the dining hall.' },
    calories: { source: 'App', meaning: 'Their daily calorie target, calculated or set by them.' },
    protein: { source: 'App', meaning: 'Their daily protein target in grams.' },
    carbs: { source: 'App', meaning: 'Their daily carbohydrate target in grams.' },
    fat: { source: 'App', meaning: 'Their daily fat target in grams.' },
    restrictions: { source: 'App', meaning: 'Every dietary flag as saved, including halal and kosher, which are religious data.' },
  },
  events: {
    participant_code: CODE, grp: GRP,
    at: { source: 'Bento', meaning: 'When it happened.' },
    kind: { source: 'Bento', meaning: 'app_open, favorite_added, favorite_removed, streak_updated, push_added or push_removed.' },
    detail: { source: 'Bento', meaning: 'A few facts about the event. Never a token or a name.' },
  },
  prompts: {
    participant_code: CODE, grp: GRP,
    local_date: { source: 'Bento', meaning: 'The day the prompt was for, in Eastern time.' },
    kind: { source: 'Bento', meaning: 'reminder (the group\'s daily reminder) or survey (the evening questions).' },
    title: { source: 'Bento', meaning: 'The title the participant saw.' },
    status: { source: 'Bento', meaning: 'sent, failed, no_device (nothing to send to) or claimed (decided, outcome not reported).' },
    claimed_at: { source: 'Bento', meaning: 'When Bento decided to send it.' },
    sent_at: { source: 'Bento', meaning: 'When Apple accepted it. Acceptance is not the same as seen.' },
    error: { source: 'Apple', meaning: 'Why it failed, when it did.' },
  },
  activity: {
    participant_code: CODE, grp: GRP,
    status: { source: 'Bento', meaning: 'active, completed or withdrawn.' },
    enrolled_at: { source: 'Bento', meaning: 'When they enrolled.' },
    days_enrolled: { source: 'Bento', meaning: 'Whole days from enrolment to now, or to the end of their window.' },
    prompts_claimed: { source: 'Bento', meaning: 'Reminders and survey prompts Bento decided to send.' },
    prompts_delivered: { source: 'Bento', meaning: 'Of those, how many Apple accepted.' },
    prompts_undelivered: { source: 'Bento', meaning: 'Of those, how many failed or had no device to send to.' },
    surveys_due: { source: 'Bento', meaning: 'Evening surveys whose time has passed since they enrolled, up to the end of their window or the day they left. The denominator for response rate.' },
    surveys_answered: { source: 'Bento', meaning: 'Surveys they answered, on time or late. The numerator for response rate.' },
    surveys_late: { source: 'Bento', meaning: 'Of those, answered the next day.' },
    plates_logged: { source: 'App', meaning: 'Plates confirmed and not undone.' },
    consumption_reports: { source: 'App', meaning: 'Of those, plates where they said how much they ate.' },
    app_opens: { source: 'App', meaning: 'Times the app was opened, at most one every 20 minutes.' },
    push_status: { source: 'Bento', meaning: 'on if the device can receive the study reminders, off if not.' },
  },
  survey_wide: {
    row_id: { source: 'Bento', meaning: 'One survey day for one participant. Same as ResponseId in the researchers\' May export.' },
    participant_code: { ...CODE, meaning: 'The participant code. Takes the place of the typed email prefix in the May export.' },
    grp: GRP,
    for_date: { source: 'Bento', meaning: 'The day the questions were for, in Eastern time.' },
    submitted_at: { source: 'App', meaning: 'When the answers were sent.' },
    late: { source: 'Bento', meaning: 'Answered on a later day than it was for.' },
  },
  audit: {
    id: { source: 'Bento', meaning: 'Entry number. Entries cannot be changed or deleted.' },
    at: { source: 'Bento', meaning: 'When it happened.' },
    email: { source: 'Bento', meaning: 'Which researcher.' },
    user_id: { source: 'Bento', meaning: 'The researcher\'s account id, which stays the same if the email changes.' },
    action: { source: 'Bento', meaning: 'export, sign_in or view_identities.' },
    detail: { source: 'Bento', meaning: 'Which sheet, which format, how many rows, whether filters were on.' },
  },
};

/* One row per column, for the Data Dictionary sheet of the workbook. */
export function dictionaryRows(sheets = SHEETS) {
  const rows = [];
  for (const sheet of sheets) {
    for (const col of sheet.columns) {
      const d = sheet.dictionary?.[col.field] ?? DICTIONARY[sheet.id]?.[col.field];
      rows.push([sheet.label, col.header, col.field, col.type, d?.source ?? '', d?.meaning ?? '']);
    }
  }
  return rows;
}

export const DICTIONARY_HEADERS = ['Sheet', 'Column', 'Field', 'Type', 'Source', 'Meaning'];
export { AUDIT_SHEET };
