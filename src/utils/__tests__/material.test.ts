import { describe, expect, it } from "vitest";
import { invalidExactMaterialCounts, placedMaterialCounts } from "../material";

const TWO_WHITE_BISHOPS = "8/8/8/8/8/8/8/2B2B2 w - - 0 1";

describe("material filters", () => {
    it("counts pieces placed on the query board", () => {
        expect(placedMaterialCounts(TWO_WHITE_BISHOPS)).toEqual({ "white-bishop": 2 });
    });

    it("rejects an exact count below the placed count", () => {
        expect(invalidExactMaterialCounts(TWO_WHITE_BISHOPS, { "white-bishop": 1 })).toEqual([
            "white-bishop",
        ]);
    });

    it("allows an equal exact count and unrestricted pieces", () => {
        expect(invalidExactMaterialCounts(TWO_WHITE_BISHOPS, { "white-bishop": 2 })).toEqual([]);
        expect(invalidExactMaterialCounts(TWO_WHITE_BISHOPS, undefined)).toEqual([]);
    });
});
