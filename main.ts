import { App } from 'npm:cdk8s';

import { MyChart } from './lib.ts'

import { parse } from "https://deno.land/std/flags/mod.ts"

const args = parse(Deno.args);
const config = await Deno.readTextFile(args.config);

const app = new App();
new MyChart(app, "test", JSON.parse(config));
app.synth();
