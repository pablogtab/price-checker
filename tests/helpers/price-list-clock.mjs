// Run only against explicitly named disposable databases. No production time API.
if (
  !new URL(
    process.env.DATABASE_URL || "postgres://invalid/no",
  ).pathname.endsWith("_test")
)
  throw Error("Clock harness requires disposable _test database");
const NativeDate = Date;
const instant = NativeDate.parse("2026-10-22T12:00:00.000Z");
globalThis.Date = class extends NativeDate {
  constructor(...args) {
    super(...(args.length ? args : [instant]));
  }
  static now() {
    return instant;
  }
};
