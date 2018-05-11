import {Agent} from "./ai/missions/Agent";
import {Mission} from "./ai/missions/Mission";
import {Operation} from "./ai/operations/Operation";
import {RoomHelper} from "./ai/RoomHelper";
import {empire} from "./helpers/loopHelper";

export let sandBox = {
    run() {
        const claimerFlag = Game.flags.claimerFlag;
        if (claimerFlag) {
            const claimer = Game.creeps.claimer;
            if (!claimer) {
                empire.spawnFromClosest(claimer.pos, [CLAIM, MOVE], "claimer");
            }
            if (claimer.pos.inRangeTo(claimerFlag, 0)) {
                claimer.claimController(claimer.room.controller);
                console.log("### claimer waiting");
            }
            else {
                empire.traveler.travelTo(claimer, claimerFlag);
            }
        }

        const sandboxFlag = Game.flags.sandbox;
        if (sandboxFlag) {
            const sandboxOp = new SandboxOperation(sandboxFlag, "sand0", "sandbox");
            global.sand0 = sandboxOp;
            sandboxOp.init();
            sandboxOp.roleCall();
            sandboxOp.actions();
            sandboxOp.finalize();
        }

        if (!Memory.temp.ranTest) {
            Memory.temp.ranTest = true;
            const place1 = Game.flags.keeper_lima6;
            const destinations = _.toArray(empire.spawnGroups);
            const selected = RoomHelper.findClosest(place1, destinations, {margin: 50});
            console.log(`selected the following: `);
            for (const value of selected) { console.log(value.destination.pos); }
        }

        if (Game.time % 10 === 0) {
            console.log("cpu: " + _.round(Memory.cpu.average, 2), "perCreep: " +
                _.round(Memory.cpu.average / Object.keys(Game.creeps).length, 2));
        }
    },
};

class SandboxOperation extends Operation {
    public initOperation() {
        this.addMission(new SandboxMission(this, "sandbox"));
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }

}

class SandboxMission extends Mission {
    public initMission() {
    }

    public roleCall() {
    }

    public missionActions() {
        this.squadTravelTest();
        this.fleeByPathTest();
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    public squadTravelTest() {
        const leaderCreep = Game.creeps.leader;
        let leader;
        if (leaderCreep) {
            leader = new Agent(leaderCreep, this);
        }
        else {
            empire.spawnFromClosest(this.flag.pos, [MOVE], "leader");
        }

        const followerCreep = Game.creeps.follower;
        let follower;
        if (followerCreep) {
            follower = new Agent(followerCreep, this);
        }
        else {
            empire.spawnFromClosest(this.flag.pos, [MOVE], "follower");
        }

        if (!leader || !follower) { return; }

        Agent.squadTravel(leader, follower, this.flag);
    }

    private fleeByPathTest() {
        const fleeFlag = Game.flags.fleeFlag;
        if (!fleeFlag) { return; }

        const fleeCreep = Game.creeps.fleeCreep;
        if (!fleeCreep) {
            empire.spawnFromClosest(fleeFlag.pos, [MOVE], "fleeCreep");
            return;
        }

        const agent = new Agent(fleeCreep, this);
        fleeFlag.id = "scaryGuy";
        const fleeing = agent.fleeByPath([fleeFlag as any], 6, 3);
        if (!fleeing) {
            agent.travelTo(fleeFlag);
        }
    }
}
