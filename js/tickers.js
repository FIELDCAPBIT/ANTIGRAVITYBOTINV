// AlphaFundamental — Ticker Universe
// Format: [ticker, name, sector, industry, moatRating, moatSources, risk1, risk2]
const RAW = [
// --- Technology: Semiconductors ---
["NVDA","NVIDIA","Technology","GPU & AI Accelerators","Wide",["Intangible Assets","Switching Costs"],"AI spending pullback","Export restrictions to China"],
["AVGO","Broadcom","Technology","Semiconductor Conglomerate","Wide",["Switching Costs","Cost Advantages"],"Customer concentration risk","VMware integration execution"],
["AMD","AMD","Technology","CPUs & GPUs","Narrow",["Intangible Assets"],"Intense competition from NVIDIA in AI","PC market cyclicality"],
["MU","Micron","Technology","Memory & Storage","Narrow",["Cost Advantages"],"Memory price cyclicality","Oversupply risk"],
["MRVL","Marvell Technology","Technology","Custom Silicon & Networking","Narrow",["Intangible Assets"],"Custom silicon competition","Data center spending volatility"],
["TSM","TSMC","Technology","Semiconductor Foundry","Wide",["Cost Advantages","Efficient Scale"],"Geopolitical Taiwan risk","Capex intensity pressure"],
["ASML","ASML","Technology","Lithography Equipment","Wide",["Intangible Assets","Efficient Scale"],"Semiconductor capex cyclicality","Export control restrictions"],
["AMAT","Applied Materials","Technology","Wafer Fab Equipment","Wide",["Switching Costs","Intangible Assets"],"Wafer fab equipment cycle downturn","China revenue restrictions"],
["LRCX","Lam Research","Technology","Etch & Deposition Equipment","Wide",["Switching Costs"],"Semiconductor capex cycle","China export controls"],
["KLAC","KLA Corp","Technology","Process Control Equipment","Wide",["Switching Costs","Intangible Assets"],"Capex cycle downturn","Customer concentration"],
["ARM","ARM Holdings","Technology","Semiconductor IP & Licensing","Wide",["Network Effects","Intangible Assets"],"RISC-V open-source competition","Royalty rate pressure"],
["TXN","Texas Instruments","Technology","Analog Semiconductors","Wide",["Cost Advantages","Intangible Assets"],"Industrial cycle downturn","Capex expansion risk"],
["QCOM","Qualcomm","Technology","Mobile & RF Semiconductors","Wide",["Intangible Assets","Switching Costs"],"Apple modem insourcing","Licensing revenue disputes"],
["SSNLF","Samsung Electronics","Technology","Memory & Consumer Electronics","Wide",["Cost Advantages","Intangible Assets"],"Memory price cyclicality","Foundry gap vs TSMC"],
["UMC","United Microelectronics","Technology","Semiconductor Foundry (Mature Nodes)","Narrow",["Cost Advantages"],"Mature node pricing pressure","Geopolitical Taiwan risk"],
["TSEM","Tower Semiconductor","Technology","Specialty Analog Foundry","Narrow",["Switching Costs"],"Foundry utilization cyclicality","Customer concentration risk"],
["MTSI","MACOM Technology","Technology","Analog & Mixed-Signal Semiconductors","Narrow",["Switching Costs","Intangible Assets"],"5G infrastructure spending pace","Defense budget cyclicality"],
["AXTI","AXT Inc","Technology","Compound Semiconductor Substrates","None",[],"Semiconductor cycle sensitivity","China export control risk"],
["TER","Teradyne","Technology","Semiconductor Test Equipment","Wide",["Switching Costs","Intangible Assets"],"Semiconductor test cycle downturn","Robotics segment execution risk"],
// --- Technology: EDA & Design ---
["CDNS","Cadence Design","Technology","EDA Software","Wide",["Switching Costs","Efficient Scale"],"Semiconductor industry downturn","AI disruption of chip design"],
["SNPS","Synopsys","Technology","EDA Software","Wide",["Switching Costs","Efficient Scale"],"Ansys integration risk","Semiconductor cycle sensitivity"],
// --- Technology: Enterprise Software & Cloud ---
["MSFT","Microsoft","Technology","Cloud & Enterprise Software","Wide",["Switching Costs","Network Effects"],"AI monetization execution risk","Antitrust regulatory pressure"],
["ORCL","Oracle","Technology","Database & Cloud Infrastructure","Wide",["Switching Costs"],"Cloud migration execution","Competition from hyperscalers"],
["CRM","Salesforce","Technology","CRM & Enterprise Cloud","Wide",["Switching Costs","Network Effects"],"Enterprise spending cuts","AI feature commoditization"],
["PLTR","Palantir","Technology","AI & Data Analytics Platform","Narrow",["Switching Costs"],"Government contract concentration","High valuation risk"],
["SNOW","Snowflake","Technology","Cloud Data Warehouse","Narrow",["Switching Costs"],"Consumption model revenue volatility","Competition from Databricks"],
["DDOG","Datadog","Technology","Cloud Observability","Narrow",["Switching Costs","Network Effects"],"Cloud spending optimization headwinds","Competition from open-source tools"],
["WDAY","Workday","Technology","HCM & Finance Cloud","Narrow",["Switching Costs"],"Enterprise software spending cuts","Competition from SAP/Oracle"],
["MDB","MongoDB","Technology","NoSQL Database Platform","Narrow",["Switching Costs"],"Atlas consumption slowdown","Competition from PostgreSQL"],
["VEEV","Veeva Systems","Technology","Life Sciences Cloud","Wide",["Switching Costs"],"Pharma R&D spending cuts","CRM migration to Vault risk"],
["CSGP","CoStar Group","Technology","Real Estate Data & Analytics","Wide",["Network Effects","Intangible Assets"],"Homes.com investment burn","Commercial RE downturn"],
["TYL","Tyler Technologies","Technology","Government Software","Wide",["Switching Costs"],"Government budget constraints","Long sales cycles"],
// --- Technology: Cybersecurity ---
["PANW","Palo Alto Networks","Technology","Cybersecurity Platform","Narrow",["Switching Costs"],"Platformization transition risk","Free cash flow conversion pressure"],
["CRWD","CrowdStrike","Technology","Endpoint Security & XDR","Narrow",["Switching Costs","Network Effects"],"Outage reputational risk","Competition from Microsoft security"],
["FTNT","Fortinet","Technology","Network Security","Narrow",["Cost Advantages","Switching Costs"],"Hardware refresh cycle slowdown","Cloud security transition"],
["NET","Cloudflare","Technology","Edge Security & CDN","Narrow",["Network Effects"],"Path to profitability timeline","Enterprise sales execution"],
// --- Technology: Internet & Digital Platforms ---
["GOOGL","Alphabet","Technology","Search & Cloud AI","Wide",["Network Effects","Intangible Assets"],"AI disruption of search","Antitrust remedies risk"],
["AMZN","Amazon","Technology","E-Commerce & Cloud (AWS)","Wide",["Network Effects","Cost Advantages"],"AWS competition from Azure/GCP","Retail margin compression"],
["META","Meta Platforms","Technology","Social Media & AI","Wide",["Network Effects"],"Metaverse investment uncertainty","Regulatory privacy restrictions"],
["ABNB","Airbnb","Technology","Short-Term Rental Marketplace","Narrow",["Network Effects"],"Regulatory crackdowns on rentals","Hotel industry competition"],
["DASH","DoorDash","Technology","Food & Grocery Delivery","Narrow",["Network Effects"],"Path to sustained profitability","Intense delivery competition"],
["SE","Sea Limited","Technology","E-Commerce & Digital Finance (SEA)","Narrow",["Network Effects"],"Profitability sustainability","Southeast Asia macro risk"],
["BKNG","Booking Holdings","Technology","Online Travel Agency","Wide",["Network Effects","Intangible Assets"],"Travel demand cyclicality","Google direct booking competition"],
["NTDOY","Nintendo","Technology","Gaming & Entertainment","Wide",["Intangible Assets"],"Console cycle dependence","Mobile gaming disruption"],
// --- Technology: Networking & Infra ---
["ANET","Arista Networks","Technology","Data Center Networking","Narrow",["Switching Costs"],"Customer concentration (hyperscalers)","Cisco competitive response"],
["CSCO","Cisco Systems","Technology","Enterprise Networking","Wide",["Switching Costs","Cost Advantages"],"Networking commoditization","SD-WAN disruption"],
["GLW","Corning","Technology","Specialty Glass & Fiber Optics","Narrow",["Intangible Assets","Switching Costs"],"Display glass overcapacity","Fiber deployment pace"],
["CIEN","Ciena","Technology","Optical Networking Equipment","Narrow",["Switching Costs","Intangible Assets"],"Telecom capex cycle","Competition from Huawei"],
["VIAV","Viavi Solutions","Technology","Network Test & Measurement","Narrow",["Switching Costs"],"Telecom capex cycle downturn","5G deployment pace"],
["FN","Fabrinet","Technology","Precision Optical Manufacturing","Narrow",["Cost Advantages","Switching Costs"],"Customer concentration risk","Optical component cyclicality"],
["MSI","Motorola Solutions","Technology","Mission-Critical Communications","Wide",["Switching Costs","Intangible Assets"],"Government budget constraints","Technology transition risk"],
["APH","Amphenol","Technology","Electronic Connectors & Sensors","Narrow",["Cost Advantages","Switching Costs"],"Industrial cycle downturn","Automotive EV adoption pace"],
["DELL","Dell Technologies","Technology","Enterprise IT Infrastructure","Narrow",["Switching Costs"],"PC market decline","Server commoditization pressure"],
["HPE","Hewlett Packard Enterprise","Technology","Hybrid Cloud & Edge Computing","Narrow",["Switching Costs"],"Enterprise IT spending weakness","Juniper integration risk"],
["CRDO","Credo Technology","Technology","High-Speed Connectivity IC","None",[],"Customer concentration risk","Design win competition"],
// --- Technology: Crypto Mining & HPC ---
["CIFR","Cipher Mining","Technology","Bitcoin Mining","None",[],"Bitcoin price volatility","Energy cost fluctuation"],
["APLD","Applied Digital","Technology","HPC & AI Data Centers","None",[],"Capital-intensive buildout risk","Customer concentration"],
["CORZ","Core Scientific","Technology","Bitcoin Mining & HPC Hosting","None",[],"Bitcoin price volatility","Bankruptcy recovery execution"],
["IREN","Iris Energy","Technology","Sustainable Bitcoin Mining","None",[],"Bitcoin price volatility","Renewable energy intermittency"],
["WULF","TeraWulf","Technology","Nuclear-Powered Bitcoin Mining","None",[],"Bitcoin price crash risk","Regulatory uncertainty"],
// --- Technology: Emerging ---
["ASTS","AST SpaceMobile","Technology","Satellite Direct-to-Cell","None",[],"Pre-revenue technology risk","Satellite deployment delays"],
["NBIS","Nebius Group","Technology","AI Infrastructure & Cloud","None",[],"Competitive AI cloud landscape","Geopolitical origin risk"],
["CRWV","CrowdVault","Technology","AI Security Infrastructure","None",[],"Pre-revenue speculative risk","Market adoption uncertainty"],
["ALAB","Astera Labs","Technology","Connectivity Semiconductors","Narrow",["Switching Costs"],"Customer concentration (hyperscalers)","Design cycle timing risk"],
["AMPX","Amprius Technologies","Technology","Silicon Anode Batteries","None",[],"Manufacturing scale-up risk","EV adoption pace uncertainty"],
["DOCN","DigitalOcean","Technology","SMB Cloud Infrastructure","Narrow",["Switching Costs"],"Competition from hyperscalers","SMB churn risk"],
["COHR","Coherent Corp","Technology","Photonics & Laser Components","Narrow",["Switching Costs"],"Telecom capex cycle","II-VI integration execution"],
["VLN","Valens Semiconductor","Technology","Audio-Video Connectivity IC","None",[],"Automotive ADAS adoption pace","Customer concentration risk"],
["BB","BlackBerry","Technology","IoT Security & QNX Software","None",[],"Revenue growth stagnation","Competition in IoT security"],
// --- Technology: Misc ---
["RELX","RELX","Technology","Scientific & Legal Data Analytics","Wide",["Switching Costs","Intangible Assets"],"Open-access disruption","Regulatory data privacy risk"],
["KYCCF","Keyence","Technology","Factory Automation Sensors","Wide",["Switching Costs","Cost Advantages"],"Industrial capex cycle downturn","Japan macro weakness"],
["IT","Gartner","Technology","IT Research & Advisory","Wide",["Switching Costs","Intangible Assets"],"Enterprise spending cuts","Competition from free AI research"],
["MOD","Modine Manufacturing","Technology","Thermal Management Systems","Narrow",["Switching Costs"],"Data center buildout pace","Customer concentration"],
// --- Industrials: Aerospace & Defense ---
["GE","GE Aerospace","Industrials","Jet Engine Manufacturing","Wide",["Switching Costs","Intangible Assets"],"Supply chain bottlenecks","Engine defect liabilities"],
["LMT","Lockheed Martin","Industrials","Defense Prime Contractor","Wide",["Intangible Assets","Efficient Scale"],"Government budget sequestration","F-35 program cost overruns"],
["TDG","TransDigm","Industrials","Aerospace Aftermarket Components","Wide",["Switching Costs","Intangible Assets"],"DOD pricing scrutiny","Aftermarket volume cyclicality"],
["GEV","GE Vernova","Industrials","Power Generation & Wind","Narrow",["Intangible Assets"],"Offshore wind execution risk","Power market volatility"],
["CW","Curtiss-Wright","Industrials","Defense Electronics & Nuclear","Narrow",["Switching Costs","Intangible Assets"],"Defense budget uncertainty","Nuclear project delays"],
["BWXT","BWX Technologies","Industrials","Nuclear Components & Fuel","Narrow",["Intangible Assets","Efficient Scale"],"Nuclear submarine program delays","Regulatory compliance risk"],
// --- Industrials: Electrical & Power Equipment ---
["ETN","Eaton Corp","Industrials","Electrical Power Management","Narrow",["Cost Advantages","Switching Costs"],"Industrial cycle downturn","Raw material cost pressure"],
["PWR","Quanta Services","Industrials","Electrical & Utility Construction","Narrow",["Cost Advantages"],"Utility capex cycle slowdown","Labor shortage risk"],
["VRT","Vertiv Holdings","Industrials","Data Center Power & Cooling","Narrow",["Switching Costs"],"Data center build-out slowdown","Supply chain constraints"],
["EMR","Emerson Electric","Industrials","Industrial Automation & Controls","Wide",["Switching Costs","Cost Advantages"],"Industrial cycle downturn","National Instruments integration"],
// --- Industrials: Heavy Equipment ---
["CAT","Caterpillar","Industrials","Construction & Mining Equipment","Wide",["Intangible Assets","Cost Advantages"],"Construction cycle downturn","China economic slowdown"],
["DE","Deere & Co","Industrials","Precision Agriculture Equipment","Wide",["Intangible Assets","Switching Costs"],"Farm income decline","Precision ag adoption pace"],
["PH","Parker Hannifin","Industrials","Motion & Control Technologies","Wide",["Switching Costs","Cost Advantages"],"Industrial cycle sensitivity","Aerospace aftermarket risk"],

["ROP","Roper Technologies","Industrials","Diversified Industrial Software","Wide",["Switching Costs"],"Acquisition integration risk","Valuation multiple compression"],
// --- Industrials: Services & Infrastructure ---
["WM","Waste Management","Industrials","Solid Waste & Recycling","Wide",["Cost Advantages","Efficient Scale"],"Environmental regulation costs","Recycling commodity price swings"],
["ROL","Rollins","Industrials","Pest Control Services","Wide",["Switching Costs","Cost Advantages"],"Labor cost inflation","Weather pattern disruption"],
["CTAS","Cintas","Industrials","Uniform & Facility Services","Wide",["Switching Costs","Cost Advantages"],"Economic recession impact","Labor market tightness"],
["WCN","Waste Connections","Industrials","Waste Collection & Disposal","Wide",["Efficient Scale","Cost Advantages"],"Regulatory compliance costs","Acquisition integration risk"],
["ODFL","Old Dominion Freight","Industrials","LTL Trucking","Wide",["Cost Advantages","Efficient Scale"],"Freight recession volume decline","Labor cost pressure"],
["FIX","Comfort Systems USA","Industrials","HVAC & Mechanical Contracting","Narrow",["Cost Advantages"],"Construction cycle slowdown","Labor shortage"],
["EME","EMCOR Group","Industrials","Electrical & Mechanical Construction","Narrow",["Cost Advantages"],"Construction spending cyclicality","Project execution risk"],
["IESC","IES Holdings","Industrials","Electrical Infrastructure Services","Narrow",["Cost Advantages"],"Data center buildout pace","Labor availability"],
["STRL","Sterling Infrastructure","Industrials","Heavy Civil & Data Center Construction","Narrow",["Cost Advantages"],"Infrastructure spending cycles","Project risk concentration"],
["FERG","Ferguson Enterprises","Industrials","Plumbing & HVAC Distribution","Narrow",["Cost Advantages","Switching Costs"],"Housing market downturn","Commodity price volatility"],

["SIEGY","Siemens","Industrials","Industrial Automation & Digitalization","Wide",["Switching Costs","Intangible Assets"],"European industrial slowdown","Portfolio complexity"],
["ABB","ABB Ltd","Industrials","Electrification & Robotics","Narrow",["Switching Costs","Cost Advantages"],"Industrial cycle downturn","Competitive pressure in automation"],
["CARR","Carrier Global","Industrials","HVAC & Refrigeration","Narrow",["Intangible Assets","Switching Costs"],"Construction cycle downturn","Viessmann integration execution"],
["SKFOF","SKF","Industrials","Bearings & Motion Technology","Narrow",["Cost Advantages","Switching Costs"],"Industrial cycle downturn","EV transition product mix shift"],
["ENS","EnerSys","Industrials","Energy Storage Solutions","Narrow",["Switching Costs"],"Lead-acid to lithium transition","Industrial demand cyclicality"],
["FLNC","Fluence Energy","Industrials","Grid-Scale Battery Storage","None",[],"Supply chain risk for battery cells","Utility procurement cycle delays"],
// --- Financials ---
["V","Visa","Financials","Global Payment Network","Wide",["Network Effects","Intangible Assets"],"Fintech disruption","Regulatory pressure on interchange fees"],
["MA","Mastercard","Financials","Global Payment Network","Wide",["Network Effects","Intangible Assets"],"Fintech disruption","Regulatory pressure on fees"],
["MCO","Moody's","Financials","Credit Ratings & Risk Analytics","Wide",["Intangible Assets","Efficient Scale"],"Regulatory scrutiny","Credit cycle downturn"],
["SPGI","S&P Global","Financials","Financial Data & Benchmarks","Wide",["Intangible Assets","Switching Costs"],"Regulatory changes","Integration risk from mergers"],
["MSCI","MSCI Inc","Financials","Index & ESG Analytics","Wide",["Switching Costs","Intangible Assets"],"Index fund fee compression","ESG backlash"],
["CME","CME Group","Financials","Derivatives Exchange","Wide",["Network Effects","Efficient Scale"],"Volume cyclicality","Regulatory clearing mandates"],
["ICE","Intercontinental Exchange","Financials","Exchanges & Mortgage Technology","Wide",["Network Effects","Efficient Scale"],"Regulatory changes","Mortgage tech adoption pace"],
["VRSK","Verisk Analytics","Financials","Insurance Data & Analytics","Wide",["Switching Costs","Intangible Assets"],"Insurance industry consolidation","Data privacy regulations"],
["JPM","JPMorgan Chase","Financials","Diversified Banking","Wide",["Cost Advantages","Switching Costs"],"Credit cycle risk","Regulatory capital requirements"],
["BAM","Brookfield Asset Mgmt","Financials","Alternative Asset Management","Narrow",["Intangible Assets","Cost Advantages"],"Fundraising environment deterioration","Real estate portfolio mark-downs"],
["MMC","Marsh & McLennan","Financials","Insurance Brokerage & Consulting","Wide",["Switching Costs","Intangible Assets"],"Insurance cycle softening","Regulatory scrutiny of broker fees"],
["AON","Aon plc","Financials","Risk Management & Insurance Brokerage","Wide",["Switching Costs","Intangible Assets"],"Insurance market softening","NFP integration risk"],

// --- Healthcare ---
["LLY","Eli Lilly","Healthcare","GLP-1 & Neuroscience Pharma","Wide",["Intangible Assets"],"GLP-1 competition intensifying","Pipeline clinical trial failures"],
["NVO","Novo Nordisk","Healthcare","GLP-1 & Diabetes Pharma","Wide",["Intangible Assets"],"GLP-1 competition from Lilly","Pricing pressure from governments"],
["ABBV","AbbVie","Healthcare","Immunology & Oncology Pharma","Wide",["Intangible Assets","Switching Costs"],"Humira biosimilar erosion","Pipeline replacement dependency"],
["AZN","AstraZeneca","Healthcare","Oncology & Rare Disease Pharma","Wide",["Intangible Assets"],"Pipeline clinical trial risk","Pricing and reimbursement pressure"],
["JNJ","Johnson & Johnson","Healthcare","Pharma & MedTech Diversified","Wide",["Intangible Assets","Cost Advantages"],"Litigation liabilities","Patent cliff on key drugs"],
["ISRG","Intuitive Surgical","Healthcare","Robotic Surgery Systems","Wide",["Switching Costs","Intangible Assets"],"Emerging robotic surgery competitors","Hospital capital spending cuts"],
["TMO","Thermo Fisher","Healthcare","Life Sciences Tools & Instruments","Wide",["Switching Costs","Cost Advantages"],"Pharma R&D spending volatility","Post-pandemic normalization"],
["DHR","Danaher","Healthcare","Life Sciences & Diagnostics","Wide",["Switching Costs","Cost Advantages"],"Bioprocessing demand normalization","Acquisition integration risk"],
["IDXX","IDEXX Laboratories","Healthcare","Veterinary Diagnostics","Wide",["Switching Costs","Efficient Scale"],"Veterinary visit volume decline","International expansion risk"],
["ZTS","Zoetis","Healthcare","Animal Health Pharmaceuticals","Wide",["Intangible Assets","Switching Costs"],"Livestock market cyclicality","Generic competition in key products"],
["ILMN","Illumina","Healthcare","Genomic Sequencing Instruments","Wide",["Switching Costs","Intangible Assets"],"GRAIL divestiture uncertainty","Competition from long-read sequencing"],
["RMD","ResMed","Healthcare","Sleep Apnea & Respiratory Devices","Wide",["Switching Costs","Intangible Assets"],"GLP-1 impact on OSA prevalence","Competitive pressure from Philips"],
["EFX","Equifax","Financials","Consumer Credit & Workforce Data","Wide",["Switching Costs","Intangible Assets"],"Mortgage market volume sensitivity","Data breach reputation risk"],
["MTD","Mettler-Toledo","Healthcare","Precision Instruments & Lab Equipment","Wide",["Switching Costs","Intangible Assets"],"Industrial lab spending cuts","China economic weakness"],
// --- Consumer ---
["COST","Costco","Consumer Staples","Membership Warehouse Club","Wide",["Cost Advantages","Switching Costs"],"Membership fee resistance","E-commerce competition"],
["TSLA","Tesla","Consumer Discretionary","Electric Vehicles & Energy","Narrow",["Intangible Assets"],"EV competition intensifying","Brand & political controversy risk"],
["LVMUY","LVMH","Consumer Discretionary","Luxury Goods Conglomerate","Wide",["Intangible Assets","Cost Advantages"],"China luxury demand slowdown","Aspirational consumer weakness"],
["HESAY","Hermes","Consumer Discretionary","Ultra-Luxury Leather & Fashion","Wide",["Intangible Assets"],"Ultra-luxury demand normalization","Succession and artisan scarcity"],
["RACE","Ferrari","Consumer Discretionary","Ultra-Luxury Automobiles","Wide",["Intangible Assets"],"EV transition execution","Exclusivity dilution risk"],
["CMPGY","Compass Group","Consumer Discretionary","Contract Food & Support Services","Wide",["Switching Costs","Cost Advantages"],"Consumer spending downturn","Labor cost inflation"],
["CFRUY","Richemont","Consumer Discretionary","Luxury Jewelry & Watches","Wide",["Intangible Assets"],"China luxury demand slowdown","E-commerce channel cannibalization"],
["AAPL","Apple","Technology","Consumer Electronics & Services","Wide",["Switching Costs","Intangible Assets"],"iPhone cycle dependence","China regulatory & demand risk"],
// --- Energy & Materials ---
["UUUU","Energy Fuels","Energy","Uranium & Rare Earth Mining","Narrow",["Cost Advantages"],"Uranium price volatility","Rare earth processing regulatory risk"],
["CCJ","Cameco","Energy","Uranium Mining & Nuclear Fuel","Narrow",["Cost Advantages"],"Uranium price volatility","Nuclear sentiment shifts"],
["EQT","EQT Corp","Energy","Natural Gas E&P","Narrow",["Cost Advantages"],"Natural gas price volatility","Production growth discipline risk"],
["FCX","Freeport-McMoRan","Materials","Copper & Gold Mining","Narrow",["Cost Advantages"],"Copper price cyclicality","Geopolitical risk in Indonesia/Peru"],
["ALB","Albemarle","Materials","Lithium & Specialty Chemicals","Narrow",["Cost Advantages"],"Lithium price collapse","EV adoption pace uncertainty"],
["MP","MP Materials","Materials","Rare Earth Mining & Processing","Narrow",["Cost Advantages"],"Rare earth price volatility","China competition and trade policy"],
["APD","Air Products","Materials","Industrial Gases","Wide",["Cost Advantages","Efficient Scale"],"Hydrogen project execution risk","Energy cost inflation"],
["LIN","Linde","Materials","Industrial Gases & Engineering","Wide",["Cost Advantages","Efficient Scale"],"Industrial demand cyclicality","Energy transition capex requirements"],
// --- Utilities & Telecom ---
["NEE","NextEra Energy","Utilities","Renewables & Regulated Utility","Wide",["Cost Advantages","Efficient Scale"],"Interest rate sensitivity","Policy changes on renewables"],
["CEG","Constellation Energy","Utilities","Nuclear Power Generation","Wide",["Cost Advantages","Efficient Scale"],"Nuclear regulatory risk","Power price volatility"],
["VST","Vistra Energy","Utilities","Diversified Power Generation","Narrow",["Cost Advantages"],"Natural gas price volatility","Renewable energy competition"],
["AWK","American Water Works","Utilities","Regulated Water Utility","Wide",["Efficient Scale","Cost Advantages"],"Regulatory rate decisions","Capital-intensive infrastructure"],
["TMUS","T-Mobile US","Communication Services","Wireless Telecom","Narrow",["Cost Advantages","Network Effects"],"Competitive pricing pressure","Spectrum auction costs"],
["IRDM","Iridium Communications","Communication Services","LEO Satellite Communications","Wide",["Efficient Scale"],"Spectrum regulatory risk","Starlink competitive threat"],
// --- Real Estate ---
["EQIX","Equinix","Real Estate","Data Center Colocation REITs","Wide",["Network Effects","Switching Costs"],"Rising interest rates","Hyperscaler self-build risk"],
["DLR","Digital Realty","Real Estate","Wholesale Data Center REITs","Narrow",["Switching Costs"],"Interest rate pressure on valuations","Hyperscaler competition"],
["AMT","American Tower","Real Estate","Cell Tower REITs","Wide",["Efficient Scale","Switching Costs"],"Interest rate sensitivity","Carrier consolidation risk"],
["O","Realty Income","Real Estate","Net Lease REIT","Narrow",["Efficient Scale"],"Interest rate sensitivity","Tenant credit risk"]
];

export const TICKERS_DATA = {};
export const TICKER_LIST = [];

RAW.forEach(r => {
  const obj = {
    ticker: r[0], name: r[1], sector: r[2], industry: r[3],
    moatRating: r[4], moatSources: r[5], risks: [r[6], r[7]]
  };
  if (!TICKERS_DATA[r[0]]) {
    TICKERS_DATA[r[0]] = obj;
    TICKER_LIST.push(obj);
  }
});

export const SECTOR_AVERAGES = {
  "Financials":             { pe: 15, pfcf: 13, evEbitda: 11, roic: 0.12, opMargin: 0.30 },
  "Technology":             { pe: 32, pfcf: 28, evEbitda: 22, roic: 0.18, opMargin: 0.25 },
  "Healthcare":             { pe: 25, pfcf: 22, evEbitda: 18, roic: 0.15, opMargin: 0.20 },
  "Consumer Staples":       { pe: 22, pfcf: 20, evEbitda: 16, roic: 0.20, opMargin: 0.18 },
  "Consumer Discretionary": { pe: 25, pfcf: 22, evEbitda: 16, roic: 0.15, opMargin: 0.12 },
  "Industrials":            { pe: 22, pfcf: 20, evEbitda: 15, roic: 0.14, opMargin: 0.15 },
  "Energy":                 { pe: 12, pfcf: 10, evEbitda: 8,  roic: 0.12, opMargin: 0.15 },
  "Utilities":              { pe: 18, pfcf: 15, evEbitda: 12, roic: 0.08, opMargin: 0.25 },
  "Real Estate":            { pe: 35, pfcf: 25, evEbitda: 20, roic: 0.05, opMargin: 0.30 },
  "Materials":              { pe: 18, pfcf: 16, evEbitda: 12, roic: 0.12, opMargin: 0.15 },
  "Communication Services": { pe: 20, pfcf: 18, evEbitda: 14, roic: 0.10, opMargin: 0.20 }
};
