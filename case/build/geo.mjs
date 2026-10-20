// Projects county and state shapes for Weis's seven states into SVG path strings (run once; output committed).
// Usage: NODE_PATH=<dir with us-atlas, topojson-client, d3-geo> node case/build/geo.mjs
import { createRequire } from "module";
import fs from "fs";
const require = createRequire(process.env.NODE_PATH + "/");
const topo = require("us-atlas/counties-10m.json");
const { feature, mesh } = require("topojson-client");
const { geoConicEqualArea, geoPath } = require("d3-geo");
const ST = new Set(["42", "24", "36", "51", "34", "10", "54"]);
const counties = feature(topo, topo.objects.counties).features.filter(f => ST.has(String(f.id).slice(0, 2)));
const states = feature(topo, topo.objects.states).features.filter(f => ST.has(String(f.id)));
const W = 760, H = 640;
const proj = geoConicEqualArea().parallels([37, 43]).rotate([77.5, 0]).fitExtent([[8, 8], [W - 8, H - 8]], { type: "FeatureCollection", features: states });
const path = geoPath(proj);
const r = n => n.replace(/(\d+\.\d)\d+/g, "$1");
const out = {
  width: W, height: H,
  counties: counties.map(f => ({ fips: String(f.id).padStart(5, "0"), name: f.properties.name, d: r(path(f)), c: path.centroid(f).map(v => +v.toFixed(1)) })),
  states: states.map(f => ({ fips: String(f.id), name: f.properties.name, d: r(path(f)) })),
  inner: r(path(mesh(topo, topo.objects.counties, (a, b) => a !== b && ST.has(String(a.id).slice(0, 2)) && ST.has(String(b.id).slice(0, 2))))),
  proj: { rotate: [77.5, 0], parallels: [37, 43], scale: proj.scale(), translate: proj.translate() }
};
fs.writeFileSync("case/data/geo_counties.json", JSON.stringify(out));
console.log(out.counties.length, "counties", out.states.length, "states", (JSON.stringify(out).length / 1024).toFixed(0) + " KB");
