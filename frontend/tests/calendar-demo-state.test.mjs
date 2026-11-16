import assert from "node:assert/strict";
import test from "node:test";

import {
  CALENDAR_DEMO_STORAGE_KEY,
  addIsoDays,
  availabilityIntervalsContain,
  availabilityRulesConflicts,
  createDefaultAvailabilityRules,
  effectiveAvailabilityIntervals,
  calendarDaySummary,
  calendarEventToCreationDraft,
  calendarDemoReducer,
  calendarDemoWeekSummary,
  calendarEventsInRange,
  calendarPrintEvents,
  calendarPrintRange,
  archiveCalendarEvent,
  applyBulkCalendarOperation,
  applyBulkRestore,
  deleteCalendarEvent,
  getBulkCalendarEligibility,
  isCalendarEventBooked,
  createCalendarDemoEvents,
  createInitialCalendarDemoState,
  findCalendarEventConflict,
  findConsultationConflict,
  isCalendarDemoState,
  isCalendarEventVisible,
  isoDateInTimeZone,
  loadCalendarDemoState,
  monthGridDates,
  prepareCalendarDayCopies,
  prepareCalendarEventEdit,
  restoreCalendarEvent,
  saveCalendarDemoState,
  startOfIsoWeek,
  validateAvailabilityRules,
  wholeDayBlockPlan,
  validateCalendarCreationDraft,
} from "../src/features/faculty/calendarDemoState.ts";
import {
  loadCalendarDemoData,
  saveCalendarDemoData,
  simulateNextCalendarDemoSaveFailure,
} from "../src/features/faculty/calendarDemoService.ts";

const legacyDemoClasses = [
  { id: "class-cs301", type: "class", date: "2026-10-22", startMinutes: 480, endMinutes: 540, title: "CS 301 Data Structures", location: "Room 210", recurrence: "weekly" },
  { id: "class-cs412", type: "class", date: "2026-10-22", startMinutes: 600, endMinutes: 660, title: "CS 412 Software Engineering", location: "Room 305", recurrence: "weekly" },
  { id: "class-cs301-extra", type: "class", date: "2026-10-20", startMinutes: 840, endMinutes: 900, title: "CS 301 Lab", location: "Lab 4" },
];

function withLegacyDemoClasses(events) {
  return [...events, ...legacyDemoClasses];
}

test("demo initializes on the requested date with the requested schedule", () => {
  const state = createInitialCalendarDemoState();
  assert.equal(state.selectedDate, "2026-10-22");
  assert.equal(state.visibleMonth, "2026-10-01");
  assert.equal(state.activeView, "month");
  assert.equal(state.acceptingRequests, true);

  const events = calendarEventsInRange(state.events, state.selectedDate, state.selectedDate);
  assert.deepEqual(
    events.map((event) => [event.startMinutes, event.endMinutes, event.type, event.title]),
    [
      [540, 585, "open-slot", "Open availability"],
      [690, 735, "consultation", "Consultation with Maria Santos"],
      [780, 825, "consultation", "Consultation with Irene Reyes"],
    ],
  );
  assert.equal(events.some((event) => event.type === "class"), false);
  assert.equal(events[1].status, "confirmed");
  assert.equal(events[2].status, "pending");
});

test("date helpers handle Monday-first weeks, leap days, and year boundaries", () => {
  assert.equal(startOfIsoWeek("2026-10-22"), "2026-10-19");
  assert.equal(addIsoDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addIsoDays("2024-02-29", 1), "2024-03-01");
  assert.equal(addIsoDays("2026-12-31", 1), "2027-01-01");

  const october = monthGridDates("2026-10-01");
  assert.equal(october[0], "2026-09-28");
  assert.equal(october.at(-1), "2026-11-01");
  assert.equal(new Date(`${october[0]}T12:00:00Z`).getUTCDay(), 1);
  const leapFebruary = monthGridDates("2024-02-01");
  assert.ok(leapFebruary.includes("2024-02-29"));
  assert.equal(leapFebruary[0], "2024-01-29");
  assert.equal(leapFebruary.at(-1), "2024-03-03");
});

test("print periods use the chosen day or the full Monday-to-Sunday week across years", () => {
  assert.deepEqual(calendarPrintRange("2026-12-31", "day"), {
    start: "2026-12-31",
    end: "2026-12-31",
  });
  assert.deepEqual(calendarPrintRange("2026-12-31", "week"), {
    start: "2026-12-28",
    end: "2027-01-03",
  });
});

test("print events ignore display filters, exclude archived availability, and retain canceled history", () => {
  const events = [
    { id: "canceled", type: "consultation", date: "2027-01-01", startMinutes: 600, endMinutes: 630, title: "Canceled consultation", location: "Room 1", status: "cancelled" },
    { id: "blocked", type: "blocked-time", date: "2027-01-02", startMinutes: 480, endMinutes: 540, title: "Blocked time", location: "Room 2" },
    { id: "archived-slot", type: "open-slot", date: "2027-01-01", startMinutes: 480, endMinutes: 510, title: "Archived slot", location: "Room 3", archived: true },
    { id: "class", type: "class", date: "2026-12-28", startMinutes: 480, endMinutes: 540, title: "Class", location: "Room 4", recurrence: "weekly", recurrenceEnd: "2027-01-04" },
  ];
  const printed = calendarPrintEvents(events, calendarPrintRange("2026-12-31", "week"));
  assert.deepEqual(printed.map((event) => [event.id, event.date]), [
    ["class@2026-12-28", "2026-12-28"],
    ["canceled", "2027-01-01"],
    ["blocked", "2027-01-02"],
  ]);
});

test("fresh calendars do not create sample class schedules", () => {
  const state = createInitialCalendarDemoState();
  const events = calendarEventsInRange(state.events, "2026-10-19", "2026-11-02");
  const classes = events.filter((event) => event.type === "class");
  assert.deepEqual(classes, []);
  assert.equal(state.events.filter((event) => event.type === "class").length, 0);
});

test("class schedules preserve optional section information in their creation draft", () => {
  const [created] = createCalendarDemoEvents({
    type: "class",
    date: "2026-10-23",
    startMinutes: 14 * 60,
    endMinutes: 15 * 60,
    slotDuration: 30,
    location: "Room 410",
    repeat: "none",
    repeatUntil: "",
    notes: "",
    className: "CS 301 Data Structures",
    classSection: "BSCS 3A",
  }, "faculty-class");
  assert.equal(created.title, "CS 301 Data Structures");
  assert.equal(created.section, "BSCS 3A");
  assert.equal(calendarEventToCreationDraft(created, created.date).classSection, "BSCS 3A");
});

test("calendar dates and filters stay synchronized through reducer actions", () => {
  let state = createInitialCalendarDemoState();
  state = calendarDemoReducer(state, { type: "select-event", eventId: "consult-irene", date: "2026-10-22" });
  assert.equal(state.selectedDate, "2026-10-22");
  assert.equal(state.selectedEventId, "consult-irene");

  state = calendarDemoReducer(state, { type: "set-filter", filter: "pending", value: false });
  assert.equal(state.filters.pending, false);
  assert.equal(isCalendarEventVisible(state.events.find((event) => event.id === "consult-irene"), state.filters), false);
  assert.equal(calendarDemoWeekSummary(state).pending, 0);

  state = calendarDemoReducer(state, { type: "set-accepting-requests", value: false });
  assert.equal(state.acceptingRequests, false);
  state = calendarDemoReducer(state, { type: "set-view", view: "week" });
  state = calendarDemoReducer(state, { type: "shift-period", amount: 1 });
  assert.equal(state.selectedDate, "2026-10-29");
  assert.equal(state.visibleMonth, "2026-10-01");
  assert.equal(state.selectedEventId, null);
});

test("selected-day summary counts consultations and computes non-duplicated bookable time", () => {
  const state = createInitialCalendarDemoState();
  assert.deepEqual(calendarDaySummary(state.events, "2026-10-22"), {
    classes: 0,
    consultations: 2,
    pendingRequests: 1,
    totalAppointments: 2,
    availableMinutes: 45,
    conflicts: 0,
  });

  const overlappingEvents = [
    { id: "slot-a", type: "open-slot", date: "2026-10-23", startMinutes: 540, endMinutes: 660, title: "Slot A", location: "Room 1" },
    { id: "slot-b", type: "open-slot", date: "2026-10-23", startMinutes: 600, endMinutes: 720, title: "Slot B", location: "Room 1" },
    { id: "meeting", type: "blocked-time", date: "2026-10-23", startMinutes: 570, endMinutes: 600, title: "Meeting", location: "Room 1" },
    { id: "class", type: "class", date: "2026-10-23", startMinutes: 630, endMinutes: 675, title: "Class", location: "Room 1" },
    { id: "appointment", type: "consultation", date: "2026-10-23", startMinutes: 660, endMinutes: 690, title: "Consultation", student: "A", topic: "B", location: "Room 1", status: "pending" },
  ];
  assert.deepEqual(calendarDaySummary(overlappingEvents, "2026-10-23"), {
    classes: 1,
    consultations: 1,
    pendingRequests: 1,
    totalAppointments: 1,
    availableMinutes: 90,
    conflicts: 1,
  });
});

test("day action intents capture their selected date, preserve filters, and clear on date changes", () => {
  let state = createInitialCalendarDemoState();
  state = calendarDemoReducer(state, { type: "select-date", date: "2026-10-23" });
  state = calendarDemoReducer(state, { type: "request-day-action", action: "copy-day" });
  assert.deepEqual(state.dayActionIntent, { action: "copy-day", date: "2026-10-23" });

  state = calendarDemoReducer(state, { type: "set-filter", filter: "classes", value: false });
  assert.deepEqual(state.dayActionIntent, { action: "copy-day", date: "2026-10-23" });
  assert.equal(state.filters.classes, false);

  state = calendarDemoReducer(state, { type: "select-date", date: "2026-10-24" });
  assert.equal(state.dayActionIntent, null);
});

test("creation splits divisible consultation availability and retains weekly series identity", () => {
  const draft = {
    type: "open-slot",
    date: "2026-10-23",
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    slotDuration: 30,
    location: "Room 302",
    repeat: "weekly",
    repeatUntil: "2026-11-06",
    notes: "Bring your draft.",
    className: "",
  };
  assert.equal(validateCalendarCreationDraft(draft, []), null);
  const created = createCalendarDemoEvents(draft, "series-1");
  assert.equal(created.length, 2);
  assert.deepEqual(created.map((event) => [event.startMinutes, event.endMinutes]), [
    [540, 570],
    [570, 600],
  ]);
  assert.ok(created.every((event) => event.seriesId === "series-1"));
  const occurrences = calendarEventsInRange(created, "2026-10-23", "2026-11-06");
  assert.equal(occurrences.length, 6);
  assert.ok(occurrences.every((event) => event.seriesId === "series-1"));
  assert.ok(occurrences.some((event) => event.id === "series-1-slot-1@2026-10-30"));
});

test("creation validation rejects leftover slot time and names exact conflicts but allows touching intervals", () => {
  const state = createInitialCalendarDemoState();
  const baseDraft = {
    type: "open-slot",
    date: "2026-10-22",
    startMinutes: 14 * 60,
    endMinutes: 15 * 60 + 10,
    slotDuration: 30,
    location: "Room 302",
    repeat: "none",
    repeatUntil: "2026-11-19",
    notes: "",
    className: "",
  };
  assert.match(validateCalendarCreationDraft(baseDraft, state.events), /divide evenly/i);

  const overlapping = {
    ...baseDraft,
    startMinutes: 8 * 60 + 30,
    endMinutes: 9 * 60 + 30,
    slotDuration: 30,
  };
  assert.match(validateCalendarCreationDraft(overlapping, withLegacyDemoClasses(state.events)), /overlaps with CS 301 Data Structures/);

  const adjacent = {
    ...baseDraft,
    type: "class",
    startMinutes: 9 * 60 + 45,
    endMinutes: 10 * 60,
    className: "Adjacent class",
  };
  assert.equal(validateCalendarCreationDraft(adjacent, state.events), null);
});

test("recurring edits preserve prior and excluded occurrences for each chosen scope", () => {
  const original = createCalendarDemoEvents({
    type: "class",
    date: "2026-10-01",
    startMinutes: 600,
    endMinutes: 660,
    slotDuration: 60,
    location: "Room 305",
    repeat: "weekly",
    repeatUntil: "2026-10-29",
    notes: "",
    className: "Original class",
  }, "class-series")[0];
  const draft = {
    type: "class",
    date: "2026-10-15",
    startMinutes: 660,
    endMinutes: 720,
    slotDuration: 60,
    location: "Room 306",
    repeat: "weekly",
    repeatUntil: "2026-10-29",
    notes: "",
    className: "Updated class",
  };
  const apply = (change, events) => [
    ...events.filter((event) => !change.removeIds.includes(event.id)),
    ...change.addEvents,
  ];

  const thisOnly = prepareCalendarEventEdit(
    [original],
    `${original.id}@2026-10-15`,
    "this",
    draft,
    "this-only",
  );
  const thisEvents = apply(thisOnly, [original]);
  assert.deepEqual(
    calendarEventsInRange(thisEvents, "2026-10-01", "2026-10-29")
      .map((event) => [event.date, event.title]),
    [
      ["2026-10-01", "Original class"],
      ["2026-10-08", "Original class"],
      ["2026-10-15", "Updated class"],
      ["2026-10-22", "Original class"],
      ["2026-10-29", "Original class"],
    ],
  );
  const allAfterException = prepareCalendarEventEdit(
    thisEvents,
    `${original.id}@2026-10-22`,
    "all",
    { ...draft, className: "All updated" },
    "all-after-exception",
  );
  const allAfterExceptionEvents = apply(allAfterException, thisEvents);
  const allAfterExceptionOccurrences = calendarEventsInRange(
    allAfterExceptionEvents,
    "2026-10-01",
    "2026-10-29",
  );
  assert.equal(
    allAfterExceptionOccurrences.filter((event) => event.date === "2026-10-15").length,
    1,
  );
  assert.equal(
    allAfterExceptionOccurrences.find((event) => event.date === "2026-10-15").title,
    "Updated class",
  );
  assert.ok(allAfterExceptionOccurrences
    .filter((event) => event.date !== "2026-10-15")
    .every((event) => event.title === "All updated"));

  const following = prepareCalendarEventEdit(
    [original],
    `${original.id}@2026-10-15`,
    "following",
    draft,
    "following",
  );
  const followingEvents = apply(following, [original]);
  assert.deepEqual(
    calendarEventsInRange(followingEvents, "2026-10-01", "2026-10-29")
      .map((event) => [event.date, event.title]),
    [
      ["2026-10-01", "Original class"],
      ["2026-10-08", "Original class"],
      ["2026-10-15", "Updated class"],
      ["2026-10-22", "Updated class"],
      ["2026-10-29", "Updated class"],
    ],
  );
  const exception = {
    ...original,
    id: `${original.id}-exception-2026-10-08`,
    date: "2026-10-08",
    recurrence: undefined,
    recurrenceEnd: undefined,
    title: "Custom exception",
  };
  const beforeFollowingEdit = [
    { ...original, excludedDates: ["2026-10-08"] },
    exception,
  ];
  const followingWithException = prepareCalendarEventEdit(
    beforeFollowingEdit,
    `${original.id}@2026-10-15`,
    "following",
    draft,
    "following-with-exception",
  );
  const followingWithExceptionEvents = apply(followingWithException, beforeFollowingEdit);
  const followingWithExceptionOccurrences = calendarEventsInRange(
    followingWithExceptionEvents,
    "2026-10-01",
    "2026-10-29",
  );
  assert.equal(
    followingWithExceptionOccurrences.find((event) => event.date === "2026-10-08").title,
    "Custom exception",
  );
  assert.equal(
    followingWithExceptionOccurrences.filter((event) => event.date === "2026-10-08").length,
    1,
  );
  assert.ok(followingWithExceptionOccurrences
    .filter((event) => event.date >= "2026-10-15")
    .every((event) => event.title === "Updated class"));

  const all = prepareCalendarEventEdit(
    [original],
    `${original.id}@2026-10-15`,
    "all",
    draft,
    "all",
  );
  const allEvents = apply(all, [original]);
  assert.ok(calendarEventsInRange(allEvents, "2026-10-01", "2026-10-29")
    .every((event) => event.title === "Updated class"));
});

test("archiving one recurring slot occurrence can be undone and restore rechecks conflicts", () => {
  const slot = createCalendarDemoEvents({
    type: "open-slot",
    date: "2026-10-23",
    startMinutes: 540,
    endMinutes: 570,
    slotDuration: 30,
    location: "Room 302",
    repeat: "weekly",
    repeatUntil: "2026-11-06",
    notes: "",
    className: "",
  }, "restore-series")[0];
  const occurrenceId = `${slot.id}@2026-10-30`;
  const archivedEvents = archiveCalendarEvent([slot], occurrenceId);
  const archived = archivedEvents.find((event) => event.archived);
  assert.ok(archived);
  assert.equal(calendarEventsInRange(archivedEvents, "2026-10-30", "2026-10-30")
    .filter((event) => event.type === "open-slot" && !event.archived).length, 0);

  const appointment = {
    id: "new-booking",
    type: "consultation",
    date: "2026-10-30",
    startMinutes: 545,
    endMinutes: 560,
    title: "New booking",
    student: "Demo student",
    topic: "Consultation",
    location: "Room 302",
    status: "confirmed",
  };
  const state = {
    ...createInitialCalendarDemoState(),
    events: [...archivedEvents, appointment],
  };
  const blockedRestore = calendarDemoReducer(state, {
    type: "restore-event",
    eventId: archived.id,
  });
  assert.equal(blockedRestore.events, state.events);

  const clearedState = { ...state, events: archivedEvents };
  const restored = calendarDemoReducer(clearedState, {
    type: "restore-event",
    eventId: archived.id,
  });
  assert.ok(calendarEventsInRange(restored.events, "2026-10-30", "2026-10-30")
    .some((event) => event.type === "open-slot" && event.startMinutes === 540));
  assert.equal(restored.events.some((event) => event.archived), false);
});

test("editing an availability slot preserves its existing title", () => {
  const slot = {
    ...createCalendarDemoEvents({
      type: "open-slot",
      date: "2026-10-23",
      startMinutes: 540,
      endMinutes: 585,
      slotDuration: 45,
      location: "Room 302",
      repeat: "none",
      repeatUntil: "",
      notes: "",
      className: "",
    }, "availability")[0],
    title: "Open availability",
  };
  const change = prepareCalendarEventEdit(
    [slot],
    slot.id,
    "all",
    {
      type: "open-slot",
      date: "2026-10-23",
      startMinutes: 540,
      endMinutes: 585,
      slotDuration: 45,
      location: "Room 303",
      repeat: "none",
      repeatUntil: "",
      notes: "",
      className: "",
    },
    "availability-edit",
  );
  assert.equal(change.addEvents[0].title, "Open availability");
});

test("booked slots reject archive and deletion until local cancellation has a written reason", () => {
  const state = createInitialCalendarDemoState();
  const slot = {
    id: "booked-slot",
    type: "open-slot",
    date: "2026-10-22",
    startMinutes: 11 * 60 + 30,
    endMinutes: 12 * 60 + 15,
    title: "Consultation availability",
    location: "Room 302",
  };
  const bookedState = { ...state, events: [...state.events, slot] };
  assert.equal(isCalendarEventBooked(bookedState.events, slot.id), true);
  for (const type of ["archive-event", "delete-event"]) {
    const unchanged = calendarDemoReducer(bookedState, { type, eventId: slot.id });
    assert.equal(unchanged.events, bookedState.events);
  }
  const noReason = calendarDemoReducer(bookedState, {
    type: "cancel-demo-appointment",
    eventId: "consult-maria",
    reason: "   ",
  });
  assert.equal(noReason.events, bookedState.events);

  const canceledState = calendarDemoReducer(bookedState, {
    type: "cancel-demo-appointment",
    eventId: "consult-maria",
    reason: "Student requested cancellation",
  });
  assert.equal(isCalendarEventBooked(canceledState.events, slot.id), false);
  assert.equal(isCalendarDemoState(canceledState), true);
  assert.equal(
    calendarDaySummary(canceledState.events, slot.date).availableMinutes -
      calendarDaySummary(bookedState.events, slot.date).availableMinutes,
    slot.endMinutes - slot.startMinutes,
  );
  const archivedState = calendarDemoReducer(canceledState, {
    type: "archive-event",
    eventId: slot.id,
  });
  assert.ok(archivedState.events.find((event) => event.id === slot.id).archived);
});

test("pending consultation acceptance converts the request and rejects commitment conflicts", () => {
  const initial = createInitialCalendarDemoState();
  const pending = initial.events.find((event) => event.id === "consult-irene");
  const accepted = calendarDemoReducer(initial, {
    type: "accept-demo-appointment",
    eventId: pending.id,
  });
  assert.equal(accepted.events.find((event) => event.id === pending.id).status, "confirmed");
  assert.equal(calendarDaySummary(accepted.events, pending.date).pendingRequests, 0);

  for (const [id, type] of [
    ["conflicting-class", "class"],
    ["conflicting-block", "blocked-time"],
    ["conflicting-confirmed", "consultation"],
  ]) {
    const commitment = {
      id,
      type,
      date: pending.date,
      startMinutes: pending.startMinutes + 5,
      endMinutes: pending.endMinutes - 5,
      title: id,
      location: "Room 1",
      ...(type === "consultation"
        ? { student: "Other student", topic: "Other topic", status: "confirmed" }
        : {}),
    };
    const state = { ...initial, events: [...initial.events, commitment] };
    assert.ok(findConsultationConflict(state.events, pending, pending.id, false));
    const unchanged = calendarDemoReducer(state, {
      type: "accept-demo-appointment",
      eventId: pending.id,
    });
    assert.equal(unchanged.events, state.events);
  }

  const adjacentCommitment = {
    id: "adjacent-class",
    type: "class",
    date: pending.date,
    startMinutes: pending.endMinutes,
    endMinutes: pending.endMinutes + 30,
    title: "Adjacent class",
    location: "Room 1",
  };
  const adjacentState = { ...initial, events: [...initial.events, adjacentCommitment] };
  assert.equal(findConsultationConflict(adjacentState.events, pending, pending.id, false), null);
});

test("declining requires a reason and retains the declined record and reason", () => {
  const initial = createInitialCalendarDemoState();
  const unchanged = calendarDemoReducer(initial, {
    type: "decline-demo-appointment",
    eventId: "consult-irene",
    reason: "   ",
  });
  assert.equal(unchanged.events, initial.events);

  const declined = calendarDemoReducer(initial, {
    type: "decline-demo-appointment",
    eventId: "consult-irene",
    reason: "   Outside consultation scope  ",
  });
  const request = declined.events.find((event) => event.id === "consult-irene");
  assert.equal(request.status, "declined");
  assert.equal(request.declineReason, "Outside consultation scope");
  assert.equal(isCalendarDemoState(declined), true);
  assert.equal(calendarDaySummary(declined.events, request.date).totalAppointments, 1);
  assert.equal(calendarDemoWeekSummary(declined).pending, 0);
});

test("confirmed consultation rescheduling validates commitments and preserves the record", () => {
  const initial = createInitialCalendarDemoState();
  initial.events = withLegacyDemoClasses(initial.events);
  const consultation = initial.events.find((event) => event.id === "consult-maria");
  const invalid = calendarDemoReducer(initial, {
    type: "reschedule-demo-appointment",
    eventId: consultation.id,
    date: "2026-10-22",
    startMinutes: 10 * 60 + 15,
    endMinutes: 11 * 60 + 15,
    location: "Room 999",
  });
  assert.equal(invalid.events, initial.events);

  const blockedEvents = [
    ...initial.events,
    {
      id: "new-blocked-window",
      type: "blocked-time",
      date: "2026-10-23",
      startMinutes: 10 * 60,
      endMinutes: 11 * 60,
      title: "Unavailable",
      location: "Room 302",
    },
  ];
  const blockedState = { ...initial, events: blockedEvents };
  const blockedReschedule = calendarDemoReducer(blockedState, {
    type: "reschedule-demo-appointment",
    eventId: consultation.id,
    date: "2026-10-23",
    startMinutes: 10 * 60 + 10,
    endMinutes: 10 * 60 + 40,
    location: "Room 302",
  });
  assert.equal(blockedReschedule.events, blockedState.events);

  const rescheduled = calendarDemoReducer(initial, {
    type: "reschedule-demo-appointment",
    eventId: consultation.id,
    date: "2026-10-23",
    startMinutes: 11 * 60,
    endMinutes: 11 * 60 + 45,
    location: "Room 410",
  });
  const updated = rescheduled.events.find((event) => event.id === consultation.id);
  assert.equal(rescheduled.events.filter((event) => event.id === consultation.id).length, 1);
  assert.equal(updated.date, "2026-10-23");
  assert.equal(updated.location, "Room 410");
  assert.equal(updated.status, "confirmed");
  assert.equal(rescheduled.selectedEventId, consultation.id);
});

test("recurring creations detect later conflicts and reducer rejects stale overlapping saves", () => {
  const state = createInitialCalendarDemoState();
  state.events = withLegacyDemoClasses(state.events);
  const recurring = {
    type: "class",
    date: "2026-10-29",
    startMinutes: 8 * 60 + 30,
    endMinutes: 9 * 60 + 30,
    slotDuration: 30,
    location: "Room 305",
    repeat: "weekly",
    repeatUntil: "2026-11-05",
    notes: "",
    className: "New class",
  };
  assert.match(validateCalendarCreationDraft(recurring, withLegacyDemoClasses(state.events)), /overlaps with CS 301 Data Structures/);

  const valid = {
    ...recurring,
    date: "2026-10-23",
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    repeat: "none",
    className: "Friday class",
  };
  const events = createCalendarDemoEvents(valid, "series-valid");
  const unchanged = calendarDemoReducer(state, {
    type: "add-events",
    events: createCalendarDemoEvents({
      ...valid,
      date: "2026-10-22",
      startMinutes: 8 * 60,
      endMinutes: 9 * 60,
    }, "series-conflict"),
    selectDate: "2026-10-22",
  });
  assert.equal(unchanged, state);

  const updated = calendarDemoReducer(state, { type: "add-events", events, selectDate: valid.date });
  assert.equal(updated.events.length, state.events.length + 1);
  assert.equal(updated.selectedDate, valid.date);
});

test("Today uses the configured timezone rather than the browser timezone", () => {
  assert.equal(
    isoDateInTimeZone(new Date("2026-10-21T16:30:00Z"), "Asia/Shanghai"),
    "2026-10-22",
  );
});

test("localStorage uses initial data only when no saved calendar exists", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value),
  };
  const initial = loadCalendarDemoState(adapter);
  assert.equal(initial.selectedDate, "2026-10-22");
  initial.selectedDate = "2026-11-05";
  initial.acceptingRequests = false;
  saveCalendarDemoState(adapter, initial);

  const loaded = loadCalendarDemoState(adapter);
  assert.equal(loaded.selectedDate, "2026-11-05");
  assert.equal(loaded.acceptingRequests, false);
  assert.equal(storage.has(CALENDAR_DEMO_STORAGE_KEY), true);
  assert.equal(isCalendarDemoState(loaded), true);
  const previousVersion = { ...loaded };
  delete previousVersion.dayActionIntent;
  assert.equal(isCalendarDemoState(previousVersion), true);
  const legacyState = { ...loaded };
  delete legacyState.availabilityRules;
  storage.set(CALENDAR_DEMO_STORAGE_KEY, JSON.stringify(legacyState));
  assert.equal(loadCalendarDemoState(adapter).availabilityRules.defaultSlotDuration, 30);
});

test("legacy sample-class migration removes only exact demo IDs and persists the cleanup", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
  const state = createInitialCalendarDemoState();
  state.events = withLegacyDemoClasses(state.events);
  state.events.push({
    id: "faculty-created-class",
    type: "class",
    date: "2026-10-23",
    startMinutes: 600,
    endMinutes: 660,
    title: "CS 301 Data Structures",
    location: "Room 410",
  });
  state.events.push({
    ...legacyDemoClasses[0],
    id: "class-cs301@2026-10-29",
    date: "2026-10-29",
  });
  saveCalendarDemoState(storage, state);

  const loaded = await loadCalendarDemoData(storage);
  assert.deepEqual(loaded.events.filter((event) => event.type === "class").map((event) => event.id), [
    "faculty-created-class",
  ]);
  assert.equal(loaded.events.some((event) => event.id === "consult-maria"), true);
  const persisted = JSON.parse(values.get(CALENDAR_DEMO_STORAGE_KEY));
  assert.deepEqual(persisted.events.filter((event) => event.type === "class").map((event) => event.id), [
    "faculty-created-class",
  ]);
});

test("invalid saved data is reported instead of silently replaced", () => {
  const adapter = { getItem: () => JSON.stringify({ selectedDate: "not-a-date" }) };
  assert.throws(() => loadCalendarDemoState(adapter), /saved calendar demo data is invalid/i);
});

test("bulk eligibility separates eligible events from protected appointment history", () => {
  const state = createInitialCalendarDemoState();
  const eligibility = getBulkCalendarEligibility(
    withLegacyDemoClasses(state.events),
    "delete",
    ["class-cs301", "consult-maria", "open-oct22"],
  );
  assert.deepEqual(eligibility.eligibleIds, ["class-cs301", "open-oct22"]);
  assert.deepEqual(eligibility.protectedEvents.map(({ event }) => event.id), ["consult-maria"]);
});

test("bulk operations protect booked slots and identify non-archivable items", () => {
  const events = [
    { id: "slot", type: "open-slot", date: "2026-10-23", startMinutes: 540, endMinutes: 600, title: "Open slot", location: "Room 1" },
    { id: "booking", type: "consultation", date: "2026-10-23", startMinutes: 550, endMinutes: 580, title: "Booking", student: "A", topic: "B", location: "Room 1", status: "pending" },
    { id: "class", type: "class", date: "2026-10-23", startMinutes: 600, endMinutes: 660, title: "Class", location: "Room 1" },
  ];
  const archiveEligibility = getBulkCalendarEligibility(events, "archive", ["slot", "booking", "class"]);
  assert.deepEqual(archiveEligibility.eligibleIds, []);
  assert.deepEqual(archiveEligibility.protectedEvents.map(({ event }) => event.id), ["slot", "booking", "class"]);
  const deleteEligibility = getBulkCalendarEligibility(events, "delete", ["slot", "booking", "class"]);
  assert.deepEqual(deleteEligibility.eligibleIds, ["class"]);
  assert.deepEqual(deleteEligibility.protectedEvents.map(({ event }) => event.id), ["slot", "booking"]);
});

test("bulk archive undo restores only affected slots and preserves unrelated changes", () => {
  const state = createInitialCalendarDemoState();
  const result = applyBulkCalendarOperation(withLegacyDemoClasses(state.events), "archive", [
    "open-oct24",
    "class-cs301-extra",
  ]);
  assert.ok(result);
  assert.deepEqual(result.eligibleIds, ["open-oct24"]);
  assert.equal(result.events.find((event) => event.id === "open-oct24").archived, true);
  assert.equal(result.events.some((event) => event.id === "class-cs301-extra"), true);

  const changedEvents = result.events.map((event) => event.id === "class-cs301-extra"
    ? { ...event, location: "Lab 9" }
    : event);
  const restored = applyBulkRestore(changedEvents, ["open-oct24"]);
  assert.ok(restored);
  assert.equal(restored.find((event) => event.id === "open-oct24").archived, false);
  assert.equal(restored.find((event) => event.id === "class-cs301-extra").location, "Lab 9");
});

test("bulk reducer applies eligible records without changing protected records", () => {
  const initial = createInitialCalendarDemoState();
  const archived = calendarDemoReducer(initial, {
    type: "bulk-calendar-events",
    operation: "archive",
    eventIds: ["open-oct24", "consult-maria"],
  });
  assert.equal(archived.events.find((event) => event.id === "open-oct24").archived, true);
  assert.equal(archived.events.find((event) => event.id === "consult-maria").status, "confirmed");

  const restored = calendarDemoReducer(archived, {
    type: "bulk-restore-archived",
    eventIds: ["open-oct24"],
  });
  assert.equal(restored.events.find((event) => event.id === "open-oct24").archived, false);
  assert.equal(restored.events.find((event) => event.id === "consult-maria").status, "confirmed");
});

test("bulk deletion of one recurring occurrence preserves the other occurrences", () => {
  const state = createInitialCalendarDemoState();
  const result = applyBulkCalendarOperation(withLegacyDemoClasses(state.events), "delete", ["class-cs301@2026-10-29"]);
  assert.ok(result);
  assert.equal(calendarEventsInRange(result.events, "2026-10-29", "2026-10-29")
    .some((event) => event.id === "class-cs301@2026-10-29"), false);
  assert.equal(calendarEventsInRange(result.events, "2026-11-05", "2026-11-05")
    .some((event) => event.title === "CS 301 Data Structures"), true);
});

test("bulk archive undo restores a recurring slot occurrence without affecting its series", () => {
  const slot = createCalendarDemoEvents({
    type: "open-slot",
    date: "2026-10-23",
    startMinutes: 540,
    endMinutes: 585,
    slotDuration: 45,
    location: "Room 302",
    repeat: "weekly",
    repeatUntil: "2026-11-06",
    notes: "",
    className: "",
  }, "bulk-slot-series")[0];
  const occurrenceId = `${slot.id}@2026-10-30`;
  const archived = applyBulkCalendarOperation([slot], "archive", [occurrenceId]);
  assert.ok(archived);
  const archivedId = archived.events.find((event) =>
    event.type === "open-slot" && event.archived,
  ).id;
  assert.deepEqual(
    calendarEventsInRange(archived.events, "2026-10-23", "2026-11-06")
      .filter((event) => event.type === "open-slot" && !event.archived)
      .map((event) => event.date),
    ["2026-10-23", "2026-11-06"],
  );

  const restored = applyBulkRestore(archived.events, [archivedId]);
  assert.ok(restored);
  assert.deepEqual(
    calendarEventsInRange(restored, "2026-10-23", "2026-11-06")
      .filter((event) => event.type === "open-slot")
      .map((event) => event.date),
    ["2026-10-23", "2026-10-30", "2026-11-06"],
  );
});

test("availability rules validate non-overlapping weekly and date override intervals", () => {
  const rules = createDefaultAvailabilityRules();
  assert.equal(validateAvailabilityRules(rules), null);
  assert.equal(rules.defaultSlotDuration, 30);
  assert.equal(rules.defaultLocation, "Room 302");
  assert.equal(rules.timeZone, "Asia/Shanghai");
  assert.deepEqual(rules.weekly[0].intervals, [{ startMinutes: 7 * 60, endMinutes: 17 * 60 }]);
  rules.weekly[0].intervals = [];
  assert.match(validateAvailabilityRules(rules), /add a working interval or disable/i);
  rules.weekly[0].intervals = [{ startMinutes: 8 * 60, endMinutes: 17 * 60 }];
  assert.equal(availabilityIntervalsContain([
    { startMinutes: 8 * 60, endMinutes: 9 * 60 },
    { startMinutes: 9 * 60, endMinutes: 10 * 60 },
  ], 8 * 60 + 30, 9 * 60 + 30), true);
  assert.equal(availabilityIntervalsContain([
    { startMinutes: 8 * 60, endMinutes: 9 * 60 },
    { startMinutes: 9 * 60 + 1, endMinutes: 10 * 60 },
  ], 8 * 60 + 30, 9 * 60 + 30), false);

  rules.weekly[0].intervals.push({ startMinutes: 16 * 60, endMinutes: 18 * 60 });
  assert.match(validateAvailabilityRules(rules), /intervals cannot overlap/i);
  rules.weekly[0].intervals = [{ startMinutes: 8 * 60, endMinutes: 10 * 60 }];
  rules.dateOverrides.push({
    date: "2026-10-22",
    unavailable: true,
    intervals: [],
  });
  assert.deepEqual(effectiveAvailabilityIntervals(rules, "2026-10-22"), []);
  assert.deepEqual(effectiveAvailabilityIntervals(rules, "2026-10-19"), rules.weekly[0].intervals);
  assert.ok(availabilityRulesConflicts(rules, createInitialCalendarDemoState().events)
    .some((event) => event.date === "2026-10-22"));
});

test("availability rules constrain slot creation but do not change existing records", () => {
  const state = createInitialCalendarDemoState();
  const rules = createDefaultAvailabilityRules();
  rules.dateOverrides.push({
    date: "2026-10-23",
    unavailable: true,
    intervals: [],
  });
  const draft = {
    type: "open-slot",
    date: "2026-10-23",
    startMinutes: 9 * 60,
    endMinutes: 9 * 60 + 30,
    slotDuration: 30,
    location: "Room 302",
    repeat: "none",
    repeatUntil: "",
    notes: "",
    className: "",
  };
  assert.match(validateCalendarCreationDraft(draft, state.events, rules), /working intervals/i);
  const savedUnavailableDate = calendarDemoReducer(state, {
    type: "save-availability-rules",
    rules,
  });
  assert.equal(savedUnavailableDate.availabilityRules.dateOverrides[0].unavailable, true);
  assert.equal(savedUnavailableDate.events, state.events);

  const clearDate = createDefaultAvailabilityRules();
  clearDate.defaultSlotDuration = 45;
  clearDate.defaultLocation = "Room 410";
  const saved = calendarDemoReducer(state, {
    type: "save-availability-rules",
    rules: clearDate,
  });
  assert.equal(saved.availabilityRules.defaultSlotDuration, 45);
  assert.equal(saved.availabilityRules.defaultLocation, "Room 410");
  assert.equal(saved.events, state.events);
});

test("day copy includes classes, unbooked slots, and blocked time but skips consultations", () => {
  const state = createInitialCalendarDemoState();
  const result = prepareCalendarDayCopies(
    withLegacyDemoClasses(state.events),
    "2026-10-22",
    ["2026-10-23"],
    state.availabilityRules,
  );
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.sourceEvents.map((event) => event.type), ["class", "open-slot", "class"]);
  assert.equal(result.copies.length, 3);
  assert.ok(result.copies.every((event) => event.date === "2026-10-23"));
  assert.equal(result.copies.some((event) => event.type === "consultation"), false);
  assert.equal(result.copies.some((event) => event.recurrence), false);
});

test("day copy previews duplicates, conflicts, and availability rule restrictions", () => {
  const state = createInitialCalendarDemoState();
  const duplicate = prepareCalendarDayCopies(
    state.events,
    "2026-10-22",
    ["2026-10-23", "2026-10-23"],
    state.availabilityRules,
  );
  assert.ok(duplicate.errors.some((error) => /duplicate/i.test(error.message)));

  const conflictEvents = [
    ...withLegacyDemoClasses(state.events),
    {
      id: "destination-conflict",
      type: "class",
      date: "2026-10-23",
      startMinutes: 8 * 60,
      endMinutes: 9 * 60,
      title: "Existing class",
      location: "Room 1",
    },
  ];
  const conflict = prepareCalendarDayCopies(
    conflictEvents,
    "2026-10-22",
    ["2026-10-23"],
    state.availabilityRules,
  );
  assert.ok(conflict.errors.some((error) => /overlaps/i.test(error.message)));

  const unavailableRules = createDefaultAvailabilityRules();
  unavailableRules.dateOverrides.push({
    date: "2026-10-23",
    unavailable: true,
    intervals: [],
  });
  const outsideHours = prepareCalendarDayCopies(
    state.events,
    "2026-10-22",
    ["2026-10-23"],
    unavailableRules,
  );
  assert.ok(outsideHours.errors.some((error) => /working intervals/i.test(error.message)));
});

test("whole-day block removes only unbooked slots and stores an all-day event", () => {
  const state = createInitialCalendarDemoState();
  const slot = {
    id: "day-slot",
    type: "open-slot",
    date: "2026-10-26",
    startMinutes: 540,
    endMinutes: 585,
    title: "Open slot",
    location: "Room 302",
  };
  const events = [...state.events, slot];
  const plan = wholeDayBlockPlan(events, "2026-10-26");
  assert.equal(plan.commitments.length, 0);
  assert.deepEqual(plan.slotsToRemove.map((event) => event.id), ["day-slot"]);
  const blocked = calendarDemoReducer({ ...state, events }, {
    type: "block-whole-day",
    date: "2026-10-26",
    removeSlotIds: ["day-slot"],
    eventId: "all-day-block",
  });
  const allDay = blocked.events.find((event) => event.id === "all-day-block");
  assert.equal(allDay.type, "blocked-time");
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.startMinutes, 0);
  assert.equal(allDay.endMinutes, 24 * 60);
  assert.equal(blocked.events.some((event) => event.id === "day-slot"), false);
});

test("whole-day blocking is prevented for classes, active appointments, and booked availability", () => {
  const state = createInitialCalendarDemoState();
  assert.ok(wholeDayBlockPlan(state.events, "2026-10-22").commitments.length > 0);

  const pendingOnly = {
    id: "pending-only",
    type: "consultation",
    date: "2026-10-26",
    startMinutes: 600,
    endMinutes: 630,
    title: "Pending only",
    student: "A",
    topic: "B",
    location: "Room 302",
    status: "pending",
  };
  const slot = {
    id: "booked-slot",
    type: "open-slot",
    date: "2026-10-26",
    startMinutes: 600,
    endMinutes: 630,
    title: "Booked slot",
    location: "Room 302",
  };
  const events = [...state.events, pendingOnly, slot];
  const plan = wholeDayBlockPlan(events, "2026-10-26");
  assert.deepEqual(plan.bookedSlots.map((event) => event.id), ["booked-slot"]);
  assert.equal(plan.commitments.some((event) => event.id === "pending-only"), true);
  const unchanged = calendarDemoReducer({ ...state, events }, {
    type: "block-whole-day",
    date: "2026-10-26",
    removeSlotIds: ["booked-slot"],
    eventId: "blocked-day",
  });
  assert.equal(unchanged.events, events);
});

test("local calendar service loads asynchronously and preserves prior data after an injected save failure", async () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
  const initial = await loadCalendarDemoData(storage);
  assert.equal(initial.selectedDate, "2026-10-22");
  await saveCalendarDemoData(storage, initial);
  const previousValue = values.get(CALENDAR_DEMO_STORAGE_KEY);
  const next = calendarDemoReducer(initial, {
    type: "set-accepting-requests",
    value: false,
  });

  simulateNextCalendarDemoSaveFailure();
  await assert.rejects(saveCalendarDemoData(storage, next), /simulated/);
  assert.equal(values.get(CALENDAR_DEMO_STORAGE_KEY), previousValue);
  assert.equal((await loadCalendarDemoData(storage)).acceptingRequests, true);

  await saveCalendarDemoData(storage, next);
  assert.equal((await loadCalendarDemoData(storage)).acceptingRequests, false);

  const unavailableStorage = {
    getItem: storage.getItem,
    setItem() {
      throw new Error("Quota exceeded");
    },
  };
  await assert.rejects(saveCalendarDemoData(unavailableStorage, initial), /Quota exceeded/);
  assert.equal((await loadCalendarDemoData(storage)).acceptingRequests, false);
  await assert.rejects(loadCalendarDemoData(null), /unavailable/);
  await assert.rejects(saveCalendarDemoData(null, initial), /unavailable/);
});
