const fs = require('fs');
let code = fs.readFileSync('src/components/Workspace.tsx', 'utf8');

code = code.replace(
  /\/\/ \n  \['decision-center', 'Decision Center'\],\n  \['deal', 'Deal facts'\],\n  \['competition', 'Competition'\],\n  \['evidence', 'Evidence'\]\n\];/,
  ''
);

fs.writeFileSync('src/components/Workspace.tsx', code);
