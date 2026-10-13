/* The sheets the researcher dashboard shows, one per database view.
 *
 * Each sheet reads a grid_* view from migration 057. Those views run with the
 * reader's rights, so a researcher on a multi-factor session sees the rows the
 * policies allow and nobody else sees anything. Every view has a stable row_id, so
 * a live update can replace a row instead of redrawing the grid.
 *
 * type decides how a column is filtered, formatted in the grid and written to a
 * file: 'text', 'number', 'bool', 'date' (a day) or 'datetime'.
 *
 * identity marks a sheet that holds names or emails. Opening or exporting one is
 * written to the audit log, and an exported file says so in its name.
 *
 * watch lists the research tables whose changes mean this sheet is out of date. */
export const SHEETS = [
  {
    id: 'participants', label: 'Participants', view: 'grid_participants', identity: true, order: 'participant_code',
    watch: ['participants'],
    columns: [
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120, pinned: true },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'status', header: 'Status', type: 'text', width: 110 },
      { field: 'full_name', header: 'Name', type: 'text', width: 180 },
      { field: 'email', header: 'Email', type: 'text', width: 240 },
      { field: 'enrolled_at', header: 'Enrolled', type: 'datetime', width: 170 },
      { field: 'window_ends_at', header: 'Window ends', type: 'datetime', width: 170 },
      { field: 'withdrawn_at', header: 'Withdrew', type: 'datetime', width: 170 },
      { field: 'acknowledged_at', header: 'Acknowledged', type: 'datetime', width: 170 },
      { field: 'platform', header: 'Platform', type: 'text', width: 100 },
      { field: 'push_status', header: 'Push', type: 'text', width: 90 },
      { field: 'install_state', header: 'Install state', type: 'text', width: 130 },
    ],
  },
  {
    id: 'roster', label: 'Roster', view: 'grid_roster', identity: true, order: 'email',
    watch: ['participants'],
    columns: [
      { field: 'email', header: 'Email', type: 'text', width: 260, pinned: true },
      { field: 'full_name', header: 'Name', type: 'text', width: 180 },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'enrolled', header: 'Enrolled', type: 'bool', width: 110 },
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120 },
      { field: 'participant_status', header: 'Status', type: 'text', width: 110 },
      { field: 'added_at', header: 'Added to list', type: 'datetime', width: 170 },
      { field: 'claimed_at', header: 'Enrolled at', type: 'datetime', width: 170 },
    ],
  },
  {
    id: 'responses', label: 'Survey answers', view: 'grid_responses', order: 'row_id',
    watch: ['responses', 'survey_days'],
    columns: [
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120, pinned: true },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'for_date', header: 'Survey for', type: 'date', width: 120 },
      { field: 'late', header: 'Late', type: 'bool', width: 80 },
      { field: 'submitted_at', header: 'Submitted', type: 'datetime', width: 170 },
      { field: 'question_position', header: 'Q#', type: 'number', width: 80 },
      { field: 'question_text', header: 'Question', type: 'text', width: 420 },
      { field: 'question_format', header: 'Format', type: 'text', width: 140 },
      { field: 'answer_text', header: 'Answer', type: 'text', width: 220 },
    ],
  },
  {
    id: 'meals', label: 'Meals', view: 'grid_meals', order: 'row_id',
    watch: ['meals'],
    columns: [
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120, pinned: true },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'meal_date', header: 'Date', type: 'date', width: 120 },
      { field: 'meal_type', header: 'Meal', type: 'text', width: 110 },
      { field: 'dining_hall', header: 'Hall', type: 'text', width: 130 },
      { field: 'confirmed_at', header: 'Confirmed', type: 'datetime', width: 170 },
      { field: 'item_count', header: 'Items', type: 'number', width: 90 },
      { field: 'consumption_reported_at', header: 'Waste reported', type: 'datetime', width: 170 },
      { field: 'deleted_at', header: 'Undone', type: 'datetime', width: 170 },
    ],
  },
  {
    id: 'plate_items', label: 'Plate items', view: 'grid_plate_items', order: 'row_id',
    watch: ['meals'],
    columns: [
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120, pinned: true },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'meal_date', header: 'Date', type: 'date', width: 120 },
      { field: 'meal_type', header: 'Meal', type: 'text', width: 110 },
      { field: 'dining_hall', header: 'Hall', type: 'text', width: 130 },
      { field: 'item_position', header: 'Item #', type: 'number', width: 90 },
      { field: 'item_name', header: 'Item', type: 'text', width: 260 },
      { field: 'servings', header: 'Servings', type: 'number', width: 100 },
      { field: 'consumed', header: 'Share eaten', type: 'number', width: 120 },
      { field: 'calories', header: 'Calories', type: 'number', width: 100 },
      { field: 'protein', header: 'Protein g', type: 'number', width: 100 },
      { field: 'carbs', header: 'Carbs g', type: 'number', width: 100 },
      { field: 'fat', header: 'Fat g', type: 'number', width: 100 },
      { field: 'deleted_at', header: 'Undone', type: 'datetime', width: 170 },
    ],
  },
  {
    id: 'snapshots', label: 'Profiles', view: 'grid_snapshots', order: 'row_id',
    watch: ['profile_snapshots'],
    columns: [
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120, pinned: true },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'taken_at', header: 'Taken', type: 'datetime', width: 170 },
      { field: 'reason', header: 'Why', type: 'text', width: 120 },
      { field: 'university', header: 'University', type: 'text', width: 130 },
      { field: 'weight', header: 'Weight', type: 'number', width: 100 },
      { field: 'weight_unit', header: 'Unit', type: 'text', width: 80 },
      { field: 'height_feet', header: 'Height ft', type: 'number', width: 100 },
      { field: 'height_inches', header: 'Height in', type: 'number', width: 100 },
      { field: 'age', header: 'Age', type: 'number', width: 80 },
      { field: 'sex', header: 'Sex', type: 'text', width: 90 },
      { field: 'activity_level', header: 'Activity', type: 'text', width: 140 },
      { field: 'goal', header: 'Goal', type: 'text', width: 140 },
      { field: 'skip_breakfast', header: 'Skips breakfast', type: 'bool', width: 140 },
      { field: 'calories', header: 'Target kcal', type: 'number', width: 110 },
      { field: 'protein', header: 'Target protein', type: 'number', width: 120 },
      { field: 'carbs', header: 'Target carbs', type: 'number', width: 120 },
      { field: 'fat', header: 'Target fat', type: 'number', width: 110 },
      { field: 'restrictions', header: 'Restrictions', type: 'text', width: 360 },
    ],
  },
  {
    id: 'events', label: 'App usage', view: 'grid_events', order: 'row_id',
    watch: ['events'],
    columns: [
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120, pinned: true },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'at', header: 'When', type: 'datetime', width: 170 },
      { field: 'kind', header: 'What', type: 'text', width: 160 },
      { field: 'detail', header: 'Detail', type: 'text', width: 320 },
    ],
  },
  {
    id: 'prompts', label: 'Reminders sent', view: 'grid_prompts', order: 'row_id',
    watch: ['prompts'],
    columns: [
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120, pinned: true },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'local_date', header: 'Day', type: 'date', width: 120 },
      { field: 'kind', header: 'Kind', type: 'text', width: 110 },
      { field: 'title', header: 'Title', type: 'text', width: 220 },
      { field: 'status', header: 'Status', type: 'text', width: 120 },
      { field: 'claimed_at', header: 'Decided', type: 'datetime', width: 170 },
      { field: 'sent_at', header: 'Sent', type: 'datetime', width: 170 },
      { field: 'error', header: 'Problem', type: 'text', width: 240 },
    ],
  },
  {
    id: 'activity', label: 'Activity', view: 'grid_activity', order: 'participant_code',
    watch: ['participants', 'prompts', 'survey_days', 'meals', 'events'],
    columns: [
      { field: 'participant_code', header: 'Participant', type: 'text', width: 120, pinned: true },
      { field: 'grp', header: 'Group', type: 'text', width: 90 },
      { field: 'status', header: 'Status', type: 'text', width: 110 },
      { field: 'enrolled_at', header: 'Enrolled', type: 'datetime', width: 170 },
      { field: 'days_enrolled', header: 'Days in', type: 'number', width: 100 },
      { field: 'prompts_claimed', header: 'Prompts decided', type: 'number', width: 140 },
      { field: 'prompts_delivered', header: 'Delivered', type: 'number', width: 110 },
      { field: 'prompts_undelivered', header: 'Not delivered', type: 'number', width: 130 },
      { field: 'surveys_due', header: 'Surveys due', type: 'number', width: 120 },
      { field: 'surveys_answered', header: 'Surveys answered', type: 'number', width: 150 },
      { field: 'surveys_late', header: 'Answered late', type: 'number', width: 130 },
      { field: 'plates_logged', header: 'Plates logged', type: 'number', width: 130 },
      { field: 'consumption_reports', header: 'Waste reports', type: 'number', width: 130 },
      { field: 'app_opens', header: 'App opens', type: 'number', width: 110 },
      { field: 'push_status', header: 'Push', type: 'text', width: 90 },
    ],
  },
];

/* The owner's own sheet. Read from the table itself, which only an owner can. */
export const AUDIT_SHEET = {
  id: 'audit', label: 'Audit', table: 'audit_log', order: 'id', descending: true, rowId: 'id',
  watch: ['audit_log'],
  columns: [
    { field: 'id', header: 'Entry', type: 'number', width: 90, pinned: true },
    { field: 'at', header: 'When', type: 'datetime', width: 180 },
    { field: 'email', header: 'Who', type: 'text', width: 240 },
    { field: 'user_id', header: 'Account id', type: 'text', width: 300 },
    { field: 'action', header: 'What', type: 'text', width: 160 },
    { field: 'detail', header: 'Detail', type: 'text', width: 420 },
  ],
};

export const sheetById = (id) => (id === AUDIT_SHEET.id ? AUDIT_SHEET : SHEETS.find((s) => s.id === id) ?? null);

/* The columns a sheet's view must provide, for a select. row_id first. */
export const selectList = (sheet) => [sheet.rowId ?? 'row_id', ...sheet.columns.map((c) => c.field)]
  .filter((f, i, a) => a.indexOf(f) === i).join(',');
