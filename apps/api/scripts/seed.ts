import { connectDB } from '../src/lib/db'
import { env } from '../src/config/env'
import Unit from '../src/models/Unit'
import Grade from '../src/models/Grade'
import Category from '../src/models/Category'
import Person from '../src/models/Person'
import User from '../src/models/User'
import argon2 from 'argon2'

async function main() {
    await connectDB(env.MONGODB_URI)

    const units = [
        { code: 'U-001', name: 'Batalioni I', parentId: null },
        { code: 'U-002', name: 'Batalioni II', parentId: null },
    ]
    const grades = [
        { code: 'OF-1', label: 'Togeri', seniority: 1 },
        { code: 'OF-2', label: 'Nëntoger', seniority: 2 },
        { code: 'OR-4', label: 'Rreshter', seniority: 3 },
    ]
    const categories = [
        { code: '01-04', label: 'Pjesëtarët e pa sistemuar', active: true },
        { code: '01-06', label: 'Atashuar (Dalje/Hyrje)', active: true },
        { code: '01-09', label: 'Operacione jashtë vendit', active: true },
        { code: '01-10', label: 'Trajnime/Shkollime jashtë vendi', active: true },
        { code: '01-12', label: 'Pushim Vjetor', active: true },
        { code: '01-13', label: 'Pushim Mjekësor', active: true },
        { code: '01-14', label: 'Spital', active: true },
    ]

    await Unit.deleteMany({})
    await Grade.deleteMany({})
    await Category.deleteMany({})
    await Person.deleteMany({})

    const unitsIns = await Unit.insertMany(units)
    const gradesIns = await Grade.insertMany(grades)
    await Category.insertMany(categories)

    const [u1] = unitsIns
    const [g1, g2] = gradesIns

    await Person.insertMany([
        { serviceNo: '10001', firstName: 'Arben', lastName: 'Gashi', gradeId: g1._id, unitId: u1._id, status: 'ACTIVE' },
        { serviceNo: '10002', firstName: 'Erion', lastName: 'Krasniqi', gradeId: g2._id, unitId: u1._id, status: 'ACTIVE' },
        { serviceNo: '10003', firstName: 'Besa', lastName: 'Hoxha', gradeId: g1._id, unitId: u1._id, status: 'ACTIVE' },
    ])

    // ✅ KRIJO ADMIN NËSE NUK EKZISTON
    const existingAdmin = await User.findOne({ username: 'admin' })
    if (!existingAdmin) {
        const passwordHash = await argon2.hash('Admin@123')
        await User.create({
            username: 'admin',
            passwordHash,
            role: 'ADMIN',
            unitId: u1._id,              // ⬅️ lidhet me Batalioni I
        })
        console.log('✅ U krijua admin user: admin / Admin@123')
    } else {
        console.log('ℹ️ Admin user ekziston tashmë: admin')
    }

    console.log('✅ Seed completed')
    process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
