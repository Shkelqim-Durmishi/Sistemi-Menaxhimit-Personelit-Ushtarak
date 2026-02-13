import { Schema, model } from 'mongoose';
const GradeSchema = new Schema({ code:String, label:String, seniority:Number },{timestamps:true});
export default model('Grade', GradeSchema);
