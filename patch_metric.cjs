const fs = require('fs');
let code = fs.readFileSync('src/components/Workspace.tsx', 'utf8');

code += `\nfunction MetricSmall({label,value}:{label:string;value:string}) { return <div className="rounded-xl bg-slate-50 p-4"><span className="text-[10px] font-black uppercase text-slate-400">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div>; }\n`;

fs.writeFileSync('src/components/Workspace.tsx', code);
