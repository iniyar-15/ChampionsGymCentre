// One-off seed script: gymnastics_skills_flat.xlsx -> Supabase skills table
const xlsx = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://xjxsoxelpyqvvsjhcevu.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqeHNveGVscHlxdnZzamhjZXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg0NjY1OSwiZXhwIjoyMDk1NDIyNjU5fQ.K1o14-iSl2uh7VBHkDAJSXaNNoCKgyIyhy9G24VdoOE'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const wb = xlsx.readFile('gymnastics_skills_flat.xlsx')
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = xlsx.utils.sheet_to_json(ws)

  // Row 0 is the real header ("Skill Name", "Apparatus", ...), data starts at index 1
  const rows = raw.slice(1).map(r => ({
    name:        r['Gymnastics Skills — All Apparatus Reference'],
    apparatus:   r['__EMPTY'],
    category:    r['__EMPTY_2'] || null,
    description: r['__EMPTY_3'] || null,
    value:       r['__EMPTY_4'] || null,
  })).filter(r => r.name && r.apparatus)

  console.log(`Loaded ${rows.length} skills from Excel`)

  // Fetch existing apparatus
  const { data: existingApparatus, error: appErr } = await supabase.from('apparatus').select('id, name')
  if (appErr) throw appErr

  const apparatusMap = {}
  existingApparatus.forEach(a => { apparatusMap[a.name.toLowerCase()] = a.id })

  // Collect unique apparatus names that need to be created
  const uniqueApparatus = [...new Set(rows.map(r => r.apparatus))]
  for (const appName of uniqueApparatus) {
    if (!apparatusMap[appName.toLowerCase()]) {
      const { data, error } = await supabase
        .from('apparatus')
        .insert({ name: appName })
        .select('id, name')
        .single()
      if (error) throw error
      apparatusMap[appName.toLowerCase()] = data.id
      console.log(`  Created apparatus: ${appName}`)
    }
  }

  // Insert skills in batches of 50
  const skills = rows.map(r => ({
    name:         r.name,
    apparatus_id: apparatusMap[r.apparatus.toLowerCase()],
    category:     r.category,
    description:  r.description,
    value:        r.value,
  }))

  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < skills.length; i += BATCH) {
    const chunk = skills.slice(i, i + BATCH)
    const { error } = await supabase.from('skills').insert(chunk)
    if (error) throw error
    inserted += chunk.length
    console.log(`  Inserted ${inserted}/${skills.length} skills`)
  }

  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
