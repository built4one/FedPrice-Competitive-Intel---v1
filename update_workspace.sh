sed -i "s/import { calculateCompanyPosition } from '..\/utils\/companyPosition';//g" src/components/Workspace.tsx
sed -i "s/\['company','Company position'\],//g" src/components/Workspace.tsx
sed -i "s/type Tab = 'position' | 'deal' | 'competition' | 'evidence' | 'company' | 'guidance';/type Tab = 'decision-center' | 'deal' | 'competition' | 'evidence';/g" src/components/Workspace.tsx
sed -i "s/\['position','Market position'\],/\['decision-center','Decision Center'\],/g" src/components/Workspace.tsx
sed -i "s/\['guidance','Final guidance'\]//g" src/components/Workspace.tsx

sed -i "s/const \[tab, setTab\] = useState<Tab>('position');/const \[tab, setTab\] = useState<Tab>('decision-center');/g" src/components/Workspace.tsx
sed -i "s/const \[company, setCompany\].*;//g" src/components/Workspace.tsx
sed -i "s/const applyCompany =.*//g" src/components/Workspace.tsx
sed -i "s/onUpdate({ ...analysis, companyContext: company, companyPosition: position, meta: { ...analysis.meta, mode: 'MARKET_AND_COMPANY' } });//g" src/components/Workspace.tsx
sed -i "s/setNotice('Company position updated.');//g" src/components/Workspace.tsx
sed -i "s/};.*//g" src/components/Workspace.tsx

# Wait, sed might mess up the curly braces of applyCompany if I just delete lines like this. 
