import { Schema, model } from 'mongoose';
const CategorySchema = new Schema({ code:String, label:String, active:{type:Boolean,default:true} },{timestamps:true});
export default model('Category', CategorySchema);
