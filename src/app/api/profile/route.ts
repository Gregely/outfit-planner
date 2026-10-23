import { route, readJson } from "@/server/api";
import { getProfile, saveProfile } from "@/server/services/preferences";
import { profilePatchSchema } from "@/lib/schemas";

export const GET = route(() => ({ profile: getProfile() }));
export const PUT = route(async (req) => ({ profile: saveProfile(await readJson(req, profilePatchSchema)) }));
