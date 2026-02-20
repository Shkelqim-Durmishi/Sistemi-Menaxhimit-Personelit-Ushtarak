// apps/api/src/models/User.ts
import { Schema, model, Types } from 'mongoose';

const UserSchema = new Schema(
  {
    username: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },

    // Roli i përdoruesit – RBAC
    role: {
      type: String,
      enum: ['ADMIN', 'OFFICER', 'OPERATOR', 'COMMANDER', 'AUDITOR'],
      default: 'OPERATOR',
    },

    // Njësia ku bën pjesë përdoruesi
    // ADMIN → zakonisht e ka null
    // OPERATOR, OFFICER, COMMANDER → duhet të kenë unitId të vlefshëm
    unitId: { type: Types.ObjectId, ref: 'Unit', default: null },

    totpSecret: { type: String, default: null },

    lastLogin: { type: Date, default: null },

    // 🔐 Siguria & bllokimi
    // nëse është true → nuk lejohet login
    isBlocked: { type: Boolean, default: false },

    // arsye opsionale pse është bllokuar (p.sh. "Too many failed logins", "Suspicious activity")
    blockReason: { type: String, default: '' },

    // numri i tentativave të dështuara radhazi
    failedLoginCount: { type: Number, default: 0 },

    // koha e fundit kur dështoi login
    lastFailedLoginAt: { type: Date, default: null },

    // nëse është true → përdoruesi DETYRIMISHT duhet ta ndryshojë password-in
    // (p.sh. login i parë, ose pasi ADMIN ia ka reset-uar password-in)
    mustChangePassword: { type: Boolean, default: false },

    // ✍️ Nënshkrimi digjital (ruajtur si DataURL PNG ose URL)
    // p.sh. "data:image/png;base64,...." ose "/uploads/signatures/userId.png"
    signatureImageUrl: { type: String, default: null },

    // kur u vendos nënshkrimi për herë të fundit
    signatureSignedAt: { type: Date, default: null },

    // (opsionale) nëse do ta detyrosh user-in të vendos nënshkrim para se me vazhdu
    // signatureRequired: { type: Boolean, default: false },

    // 📅 Afati i kontratës
    // Nëse neverExpires = true → këto dy mund të jenë null dhe user-i s’ka afat skadimi
    contractValidFrom: { type: Date, default: null }, // kur fillon kontrata
    contractValidTo: { type: Date, default: null }, // kur skadon (nëse ka afat)
    neverExpires: { type: Boolean, default: true }, // nëse është true → user-i nuk skadon kurrë
  },
  { timestamps: true }
);

/* -------------------------------------------
   INDEXET (shumë të rëndësishme për performancë)
-------------------------------------------- */

// user-at e një unit-i shpesh kërkohen → index
UserSchema.index({ unitId: 1 });

// shpesh na duhet lista e user-ave të bllokuar
UserSchema.index({ isBlocked: 1 });

// shpesh na duhet me gjet user-a pa nënshkrim (për detyrim / audit)
UserSchema.index({ signatureImageUrl: 1 });

// (opsionale) për query të shpejta mbi kontratat
// UserSchema.index({ contractValidFrom: 1, contractValidTo: 1, neverExpires: 1 });

export default model('User', UserSchema);