import { Response, NextFunction } from 'express';
export type Role = 'ADMIN'|'OFFICER'|'OPERATOR'|'COMMANDER'|'AUDITOR';
export function requireRole(...roles: Role[]){
  return (req: any, res: Response, next: NextFunction)=>{
    const role: Role|undefined = req.user?.role;
    if(!role || !roles.includes(role)) return res.status(403).json({code:'FORBIDDEN',message:'Insufficient role'});
    next();
  };
}
