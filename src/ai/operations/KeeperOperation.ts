import {MAX_HARVEST_DISTANCE} from "../../config/constants";
import {EnhancedBodyguardMission} from "../missions/EnhancedBodyguardMission";
import {GeologyMission} from "../missions/GeologyMission";
import {InvaderGuru} from "../missions/InvaderGuru";
import {LairMission} from "../missions/LairMission";
import {MiningMission} from "../missions/MiningMission";
import {RemoteBuildMission} from "../missions/RemoteBuildMission";
import {ScoutMission} from "../missions/ScoutMission";
import {Operation} from "./Operation";

export class KeeperOperation extends Operation {
    /**
     * Remote mining, spawns Scout if there is no vision, spawns a MiningMission for each source in the missionRoom.
     * Can also mine minerals from core rooms
     * @param flag
     * @param name
     * @param type
     * @param empire
     */
    constructor(flag: Flag, name: string, type: string) {
        super(flag, name, type);
    }

    public initOperation() {
        this.initRemoteSpawn(MAX_HARVEST_DISTANCE, 8, 50);
        if (this.remoteSpawn) {
            this.spawnGroup = this.remoteSpawn.spawnGroup;
        }
        else {
            console.log("ATTN: no spawnGroup found for", this.name);
            return;
        }

        this.addMission(new ScoutMission(this));
        const invaderGuru = new InvaderGuru(this);
        invaderGuru.init();
        this.addMission(new EnhancedBodyguardMission(this, invaderGuru));
        this.addMission(new LairMission(this, invaderGuru));

        if (!this.hasVision) return; // early

        for (let i = 0; i < this.sources.length; i++) {
            if (this.sources[i].pos.lookFor(LOOK_FLAGS).length > 0) continue;
            this.addMission(new MiningMission(this, "miner" + i, this.sources[i]));
        }

        this.addMission(new RemoteBuildMission(this, true));

        if (this.mineral.pos.lookFor(LOOK_FLAGS).length === 0) {
            this.addMission(new GeologyMission(this));
        }
    }

    public finalizeOperation() {
    }

    public invalidateOperationCache() {
    }
}
