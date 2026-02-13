import { Schema, model, Types } from 'mongoose';
const UnitSchema = new Schema({
  code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  parentId: { type: Types.ObjectId, ref: 'Unit', default: null }
},{ timestamps:true});
export default model('Unit', UnitSchema);
