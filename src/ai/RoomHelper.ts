import {empire} from "../helpers/loopHelper";

export interface FindClosestOptions {
    linearDistanceLimit?: number;
    opsLimit?: number;
    margin?: number;
    byRoute?: boolean;
}

export class RoomHelper {
    public static findClosest<T extends { pos: RoomPosition }>(origin: { pos: RoomPosition }, destinations: T[],
                                                               options: FindClosestOptions = {}): Array<{ destination: T, distance: number }> {

        if (options.linearDistanceLimit === undefined) {
            options.linearDistanceLimit = 16; // pathfinder room search limit
        }

        if (options.margin === undefined) {
            options.margin = 0;
        }

        const totalCPU = Game.cpu.getUsed();

        const filtered = _(destinations)
            .filter(dest => Game.map.getRoomLinearDistance(origin.pos.roomName, dest.pos.roomName) <= options.linearDistanceLimit)
            .sortBy(dest => Game.map.getRoomLinearDistance(origin.pos.roomName, dest.pos.roomName))
            .value();

        let bestDestinations: Array<{ destination: T, distance: number }> = [];
        let bestLinearDistance = Number.MAX_VALUE;
        let bestDistance = Number.MAX_VALUE;
        for (const dest of filtered) {
            const linearDistance = Game.map.getRoomLinearDistance(origin.pos.roomName, dest.pos.roomName);
            if (linearDistance > bestLinearDistance) {
                continue;
            }

            let distance;
            if (options.byRoute) {
                const route = empire.traveler.findRoute(origin.pos.roomName, dest.pos.roomName);
                if (!route) { continue; }
                distance = Object.keys(route).length;
            }
            else {
                const ret = empire.traveler.findTravelPath(origin, dest, {maxOps: options.opsLimit});
                if (ret.incomplete) { continue; }
                distance = ret.path.length;
            }

            if (distance < bestDistance) {
                bestLinearDistance = linearDistance;
                bestDistance = distance;
                bestDestinations = _.filter(bestDestinations, value => value.distance <= bestDistance + options.margin);
            }

            if (distance <= bestDistance + options.margin) {
                bestDestinations.push({destination: dest, distance});
            }
        }

        console.log(`FINDCLOSEST: cpu: ${Game.cpu.getUsed() - totalCPU}, # considered: ${destinations.length},` +
            ` # selected ${bestDestinations.length}`);

        return bestDestinations;
    }
}
