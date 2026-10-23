// Public browser configuration only. Never put a service_role / secret key here.
// See SETUP.md for project creation, database policies, and Google OAuth setup.
export const siteConfig = Object.freeze({
    supabaseUrl: 'https://kcoqkxtormklcfxmfmdb.supabase.co',
    supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtjb3FreHRvcm1rbGNmeG1mbWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3MzA1ODcsImV4cCI6MjEwODMwNjU4N30.LE5gqkrNQEEsVmEXVDiirmOncGR4OwvxVKf26hQ-WIA',
    // Public pages show the published content managed in the staff workspace.
    publicDataSource: 'supabase',
});
