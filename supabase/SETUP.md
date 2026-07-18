# Anzen Dictionary — ការដំឡើង Supabase (Setup)

ការណែនាំមួយជំហានម្តងៗ ដើម្បីធ្វើឲ្យកម្មវិធីវចនានុក្រម មានគណនីពិត។
(Real accounts: Admin បង្កើតគណនី គ្រូ និង សិស្ស។)

---

## ជំហានទី ១ — បង្កើត Supabase project
1. ចូល <https://supabase.com> → **New project**
2. ដាក់ឈ្មោះ ឧ. `anzen-dictionary`, ជ្រើស region **Singapore**, កំណត់ DB password
3. រង់ចាំ ~២ នាទី ឲ្យវាដំឡើងរួច

## ជំហានទី ២ — Run SQL ទាំង ២
បើក **SQL Editor** (ម៉ឺនុយឆ្វេង) → **New query**:
1. Copy មាតិកា `01_schema.sql` ដាក់ → ចុច **Run**
2. New query ម្តងទៀត → Copy `02_rls.sql` ដាក់ → **Run**
3. គ្មាន error ពណ៌ក្រហម = ជោគជ័យ ✓

## ជំហានទី ៣ — បិទ Public Signup (សំខាន់ណាស់)
ដើម្បីឲ្យមានតែ **Admin** ទេ ដែលបង្កើតគណនីបាន៖
- **Authentication → Sign In / Providers → Email**
- បិទ (OFF) **"Allow new users to sign up"**
- (បើមាន) បិទ **"Confirm email"** ដែរ ដើម្បីឲ្យគណនីថ្មីប្រើបានភ្លាម

## ជំហានទី ៤ — បង្កើតគណនី Admin ដំបូង
1. **Authentication → Users → Add user** → បញ្ចូល email + password (ឧ. admin@anzen.kh)
   - គូស **Auto Confirm User** ✓
2. ត្រឡប់ទៅ **SQL Editor** → New query → Run (ប្តូរ email ឲ្យត្រូវ)៖
   ```sql
   update public.profiles set role = 'admin'
   where email = 'admin@anzen.kh';
   ```
   ✅ ឥឡូវគណនីនេះជា Admin ពេញសិទ្ធិ។

## ជំហានទី ៥ — Deploy Edge Function (ឲ្យ Admin បង្កើតគណនីក្នុង app បាន)
- **Edge Functions → Deploy a new function** (ឬ Create function)
- ដាក់ឈ្មោះ **`admin-create-user`** (ត្រូវតែឈ្មោះនេះ)
- Copy មាតិកា `edge-admin-create-user/index.ts` ដាក់ → **Deploy**
- មិនបាច់កំណត់ secret ទេ — Supabase ផ្តល់ `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` ដោយស្វ័យប្រវត្តិ។

> បើមិនទាន់ចង់ deploy Edge Function ក៏បាន — Admin នៅតែបង្កើតគណនីបាន
> ដោយ **Authentication → Add user** ក្នុង dashboard ផ្ទាល់ (ជំហានទី ៤ បែបនោះ)
> រួច update role/teacher_id ក្នុង SQL។ តែ Edge Function ធ្វើឲ្យ Admin
> បង្កើតគណនីបាន **ក្នុង app** ស្រួលជាង។

## ជំហានទី ៦ — យក API keys ដាក់ក្នុង app
- **Project Settings → API**:
  - `Project URL` — ឧ. `https://abcd.supabase.co`
  - `anon public key` — key វែងមួយ (មិនមែន secret)
- បើកឯកសារ **`app/config.js`** → ដាក់តម្លៃ ២ នេះចូល៖
  ```js
  window.DICT_CONFIG = {
    SUPABASE_URL: "https://abcd.supabase.co",
    SUPABASE_ANON_KEY: "eyJhbGci..."
  };
  ```
- Save ✓

⚠️ **កុំ** ដាក់ `service_role key` ក្នុង app ជាដាច់ខាត (វា secret — server only)។

---

## របៀបប្រើ (After setup)
- **Admin** login → ទៅ screen "គ្រប់គ្រងគណនី" → បង្កើតគណនី គ្រូ/សិស្ស
  (សិស្ស ត្រូវជ្រើសរើសគ្រូម្នាក់)។
- **គ្រូ** login → ប្រើវចនានុក្រម + screen "សិស្ស" ដើម្បីមើលវឌ្ឍនភាពសិស្សខ្លួន។
- **សិស្ស** login → ប្រើវចនានុក្រម; ពាក្យដែលបានមើល / សំណព្វ / លទ្ធផលតេស្ត
  ត្រូវ save ទៅ cloud ស្វ័យប្រវត្តិ (គ្រូមើលឃើញ)។

## តារាង (reference)
`profiles` (id · email · full_name · role · teacher_id · viewed · favorites ·
history · settings · created_at)
