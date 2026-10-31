export function PrivacyNotice() {
  return <details className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
    <summary className="cursor-pointer font-semibold">Privacy and access to your data</summary>
    <p className="mt-3">SchedWise stores account details, schedules, appointment reasons, consultation summaries, and security audit activity to manage academic consultations. Students can access their own records; assigned faculty can access their consultations; administrators can manage accounts and view shared records and reports. Private faculty notes are available only to the assigned faculty through the app. Authorized database and backup operators can still access stored data.</p>
    <p className="mt-3">Avoid including unnecessary sensitive information in appointment reasons. Contact your school administrator to request a correction, a copy of your information, or a retention/deletion review. No automatic deletion period is configured; the school must establish its retention policy before real student data is collected. Verification and password-reset emails are delivered through the configured email provider. Check your inbox and spam folder.</p>
  </details>
}
