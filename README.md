# Anzen Dictionary (វចនានុក្រម ជប៉ុន–ខ្មែរ)

កម្មវិធីវចនានុក្រម ជប៉ុន→ខ្មែរ សម្រាប់សៀវភៅជំនាញ "ឡានដឹកទំនិញ" ជាមួយ
គណនីពិត — **Admin** បង្កើតគណនី **គ្រូ** និង **សិស្ស**; គ្រូមើលវឌ្ឍនភាពសិស្ស។
Backend = **Supabase**, hosting = **GitHub Pages**.

A Japanese→Khmer dictionary app with real accounts (admin / teacher / student),
Supabase backend, and GitHub Pages hosting.

---

## រចនាសម្ព័ន្ធ (Structure)

| Folder / file | អ្វី |
|---|---|
| `app/` | កម្មវិធីខ្លួនឯង (website ដែល GitHub Pages deploy) |
| `app/index.html` | template + logic ទាំងអស់ |
| `app/config.js` | **ដាក់ Supabase URL + anon key នៅទីនេះ** |
| `app/vendor/` | React · ReactDOM · Babel · dc-runtime · supabase-js (local) |
| `supabase/` | SQL, Edge Function, និង SETUP.md សម្រាប់ backend |
| `.github/workflows/deploy.yml` | auto-deploy `app/` ទៅ GitHub Pages |

---

## ដំឡើង (Setup) — ២ ផ្នែក

### 1) Supabase (backend)
មើល [`supabase/SETUP.md`](supabase/SETUP.md) — បង្កើត project, run SQL ២,
បិទ public signup, បង្កើត Admin ដំបូង, deploy Edge Function, យក URL + anon key។

### 2) ដាក់ key ចូល app
កែ [`app/config.js`](app/config.js) ដាក់ `SUPABASE_URL` និង `SUPABASE_ANON_KEY`
(អាចកែផ្ទាល់លើ github.com បាន → វា auto-deploy ឡើងវិញ)។

> បើ `config.js` នៅទទេ → app ដំណើរការជា **Demo mode** (គណនីសាកល្បង
> `admin@demo` / `teacher@demo` / `student@demo`, ពាក្យសម្ងាត់ `demo` —
> ទិន្នន័យរក្សាក្នុង browser តែប៉ុណ្ណោះ)។

---

## Hosting (GitHub Pages)
នៅ repo: **Settings → Pages → Source = GitHub Actions**។
រាល់ពេល push ទៅ `main`, workflow deploy `app/` ដោយស្វ័យប្រវត្តិ។
URL: `https://<username>.github.io/<repo>/`

## បើកមើលនៅ local (optional)
ត្រូវ serve តាម HTTP (មិនមែន double-click ទេ)៖
```
cd app
npx serve .        # ឬ server ណាមួយ
```

## សុវត្ថិភាព (Security)
- `anon key` — public-safe (ការពារដោយ RLS)។ ដាក់ក្នុង `config.js` បាន។
- `service_role key` — **secret**, ប្រើតែក្នុង Supabase Edge Function (env)។
  កុំ commit វាចូល repo ជាដាច់ខាត។
