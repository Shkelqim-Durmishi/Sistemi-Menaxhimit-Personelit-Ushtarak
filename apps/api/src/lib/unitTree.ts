import { Types } from 'mongoose';
import Unit from '../models/Unit';

// Kthen [unitId + të gjitha children (recursively)]
export async function getDescendantUnitIds(rootUnitId: string): Promise<string[]> {
    const root = String(rootUnitId);
    const seen = new Set<string>();
    const queue: string[] = [root];
    seen.add(root);

    while (queue.length) {
        const current = queue.shift()!;
        const children = await Unit.find({ parentId: new Types.ObjectId(current) })
            .select('_id')
            .lean();

        for (const c of children) {
            const id = String(c._id);
            if (!seen.has(id)) {
                seen.add(id);
                queue.push(id);
            }
        }
    }

    return Array.from(seen);
}
