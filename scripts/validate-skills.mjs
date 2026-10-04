import fs from "node:fs";
import YAML from "yaml";
const root = ".codex/skills";
for (const name of fs.readdirSync(root)) {
 const text = fs.readFileSync(`${root}/${name}/SKILL.md`, "utf8");
 if (!/^---\r?\n/.test(text)) throw new Error(`${name}: missing frontmatter`);
 const meta = YAML.parse(text.split("---")[1]);
 if (meta.name !== name || typeof meta.description !== "string" || !meta.description.trim() || !/^[a-z0-9-]{1,64}$/.test(name)) throw new Error(`${name}: invalid metadata`);
 if (/TODO|\[insert|TBD/.test(text)) throw new Error(`${name}: unfinished skill`);
 console.log(`${name}: valid`);
}
