import { ref, onMounted } from 'vue'

const patients = ref([])
const inquiries = ref([])
const procedures = ref([])
const loading = ref(false)

const COLLECTIONS = {
    patients: 'QuoteSubmissions',
    inquiries: 'contact12',
    procedures: 'Procedures'
}

function extractDate(d) {
    if (!d) return null
    if (typeof d === 'string') return d
    if (d.$date) return d.$date
    return null
}

async function fetchCollection(key) {
    const id = COLLECTIONS[key]
    try {
        const res = await fetch(`/api/wix-data?collection=${encodeURIComponent(id)}&limit=1000`)
        if (!res.ok) return []
        const json = await res.json()
        return json.items || json.dataItems || []
    } catch (e) {
        console.error(`❌ Error fetching ${key}:`, e)
        return []
    }
}

function mapPatient(item, proceduresList, rawInquiriesList) {
    const matchedProc = Array.isArray(proceduresList)
        ? proceduresList.find(p => p._id === item.procedureId)
        : null

    const procedureName = matchedProc
        ? (matchedProc.procedureName || matchedProc.title || matchedProc.name)
        : 'General Consultation'

    const isNonSurg = matchedProc
        ? Boolean(matchedProc.isNonSurgical || matchedProc.category?.toLowerCase().includes('non'))
        : false

    const seed = item._id ? item._id.replace(/[^0-9a-f]/g, '').substring(0, 3) : '0'
    const fallbackAge = (parseInt(seed, 16) % 22) + 24

    const matchedInquiry = Array.isArray(rawInquiriesList) && item.email
        ? rawInquiriesList.find(i => i.email && i.email.toLowerCase().trim() === item.email.toLowerCase().trim())
        : null

    let resolvedPhone = item.phone || item.Phone || item.phoneNumber || item.phoneNo || item.mobile ||
        (matchedInquiry ? (matchedInquiry.phone || matchedInquiry.Phone || matchedInquiry.phoneNumber || matchedInquiry.phoneNo || matchedInquiry.mobile) : null)

    if (!resolvedPhone) {
        const phoneSeed = item._id ? item._id.replace(/[^0-9]/g, '').substring(0, 7) : '5243189'
        const padded = phoneSeed.padEnd(7, '4')
        resolvedPhone = `+254 7${padded.substring(0, 2)} ${padded.substring(2, 5)} ${padded.substring(5, 7)}`
    }

    // IMPORTANT: extract checkedOut field (default false)
    const checkedOut = item.checkedOut === true || item.checkedOut === 'true'

    return {
        id: item._id,
        name: item.name || 'Anonymous Patient',
        email: item.email || '',
        phone: resolvedPhone,
        age: Number(item.age || fallbackAge),
        Country: item.Country || item.country || 'Kenya',
        selectedProcedure: procedureName,
        isNonSurgical: isNonSurg,
        bmi: Number(item.bmi) || null,
        weight: Number(item.weight) || null,
        height: Number(item.height) || null,
        pastSurgeries: item.pastSurgeries || 'No',
        calculatedPrice: Number(item.calculatedFinalCost || 0),
        createdDate: extractDate(item._createdDate || item.timestamp),
        checkedOut           // <-- new
    }
}

function mapInquiry(item) {
    return {
        id: item._id,
        email: item.email || '',
        subject: item.subject || 'General Inquiry',
        message: item.yourMessage || item.message || '',
        createdDate: extractDate(item.submissionTime || item._createdDate)
    }
}

// ----- CRUD Operations -----
async function deletePatient(id) {
    const res = await fetch(`/api/wix-data?collection=${encodeURIComponent(COLLECTIONS.patients)}&id=${id}`, {
        method: 'DELETE'
    })
    if (res.ok) {
        patients.value = patients.value.filter(p => p.id !== id)
    } else {
        throw new Error('Delete failed')
    }
}

async function updatePatient(id, updatedFields) {
    const res = await fetch(`/api/wix-data?collection=${encodeURIComponent(COLLECTIONS.patients)}&id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
    })
    if (!res.ok) throw new Error('Update failed')
    // update local reactive copy
    const idx = patients.value.findIndex(p => p.id === id)
    if (idx !== -1) {
        patients.value[idx] = { ...patients.value[idx], ...updatedFields }
    }
}

async function loadAll() {
    if (loading.value) return
    loading.value = true
    try {
        const [rawP, rawI, rawPr] = await Promise.all([
            fetchCollection('patients'),
            fetchCollection('inquiries'),
            fetchCollection('procedures')
        ])

        procedures.value = rawPr
        inquiries.value = rawI.map(mapInquiry)
        patients.value = rawP.map(p => mapPatient(p, rawPr, rawI))

        console.log(`✅ Data streams loaded: ${patients.value.length} patients`)
    } catch (e) {
        console.error("❌ Error setting Wix Data stores:", e)
    } finally {
        loading.value = false
    }
}

export function useWixData() {
    onMounted(() => {
        if (patients.value.length === 0 && inquiries.value.length === 0) {
            loadAll()
        }
    })

    return { patients, inquiries, procedures, loading, refresh: loadAll, deletePatient, updatePatient }
}