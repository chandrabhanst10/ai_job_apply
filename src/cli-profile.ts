import "dotenv/config";
import { loadProfile } from "./profile";
import { loadSettings } from "./settings";

loadSettings();
loadProfile().then((p) => console.log(JSON.stringify(p, null, 2)));
