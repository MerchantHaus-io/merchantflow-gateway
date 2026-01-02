import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { 
  Calculator, 
  DollarSign, 
  Server, 
  Package, 
  Sliders, 
  List, 
  CheckCircle, 
  HandCoins
} from "lucide-react";
import { cn } from "@/lib/utils";

// Constants for default fees
const SELL_RATES = {
  percent: 0.0050, // 0.50%
  perItem: 0.25,
  monthlyFee: 7.95,
  regFee: 6.95,
  annualFee: 99.00,
  batchFee: 0.25,
  avsFee: 0.07,
  monthlyMin: 10.00
};

const RevenueCalculator = () => {
  const [isProviderMode, setIsProviderMode] = useState(false);
  
  // Input States
  const [volume, setVolume] = useState(50000);
  const [avgTicket, setAvgTicket] = useState(125);
  const [cogsPercent, setCogsPercent] = useState(30);
  const [avsPercent, setAvsPercent] = useState(100);
  const [batches, setBatches] = useState(30);
  
  // Provider Input States
  const [buyRatePercent, setBuyRatePercent] = useState(0.05);
  const [buyPerItem, setBuyPerItem] = useState(0.04);
  const [buyMonthly, setBuyMonthly] = useState(0.00);
  const [buyAvs, setBuyAvs] = useState(0.02);
  const [splitPercent, setSplitPercent] = useState(100);

  // Derived Stats
  const transCount = avgTicket > 0 ? Math.ceil(volume / avgTicket) : 0;
  const avsCount = Math.ceil(transCount * (avsPercent / 100));

  // Fees (Revenue)
  const feeRate = volume * SELL_RATES.percent;
  const feeTrans = transCount * SELL_RATES.perItem;
  const feeBatch = batches * SELL_RATES.batchFee;
  const feeAvs = avsCount * SELL_RATES.avsFee;
  const fixedMonthly = SELL_RATES.monthlyFee + SELL_RATES.regFee + (SELL_RATES.annualFee / 12);
  
  const totalRevenue = feeRate + feeTrans + feeBatch + feeAvs + fixedMonthly;

  // Costs (Buy Rates)
  const buyBpDecimal = buyRatePercent / 100;
  const costRate = volume * buyBpDecimal;
  const costTrans = transCount * buyPerItem;
  const costAvs = avsCount * buyAvs;
  const costFixed = buyMonthly;
  
  const totalBuyCost = costRate + costTrans + costAvs + costFixed;

  // Margins
  const marginRate = feeRate - costRate;
  const marginTrans = feeTrans - costTrans;
  const marginBatch = feeBatch; // Assuming 0 cost
  const marginAvs = feeAvs - costAvs;
  const marginFixed = fixedMonthly - costFixed;
  
  const totalMargin = totalRevenue - totalBuyCost;
  
  // Profit & Split
  const finalProviderProfit = totalMargin * (splitPercent / 100);
  
  // Merchant Logic
  const cogsCost = volume * (cogsPercent / 100);
  const merchantNetPayout = volume - totalRevenue;
  const merchantNetProfit = merchantNetPayout - cogsCost;
  
  const effectiveRate = volume > 0 ? (totalRevenue / volume) * 100 : 0;

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <AppLayout pageTitle="Revenue Calculator">
      <main className="flex-1 overflow-auto p-4 md:p-8 bg-merchant-black text-merchant-text">
        <div className="max-w-6xl mx-auto space-y-8">
              
              {/* Header Area */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors duration-300",
                    isProviderMode ? "bg-blue-600 shadow-blue-900/50" : "bg-merchant-red shadow-red-900/50"
                  )}>
                    <Calculator className="text-white w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">
                      Merchant
                      <span className={cn("transition-colors duration-300", isProviderMode ? "text-blue-500" : "text-merchant-redLight")}>
                        Haus
                      </span>
                    </h1>
                    <p className="text-xs text-gray-500">
                      {isProviderMode ? "Provider Profit Analysis" : "Merchant Profit Calculator"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-merchant-dark border border-merchant-gray px-4 py-2 rounded-full">
                  <span className="text-xs font-medium text-gray-400">Merchant View</span>
                  <div 
                    className="relative inline-flex h-5 w-10 cursor-pointer items-center rounded-full border border-gray-600 bg-merchant-gray transition-colors hover:bg-merchant-gray/80"
                    onClick={() => setIsProviderMode(!isProviderMode)}
                  >
                    <span 
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        isProviderMode ? "translate-x-5 border-blue-500" : "translate-x-0"
                      )} 
                    />
                  </div>
                  <span className="text-xs font-medium text-white">Provider Mode</span>
                </div>
              </div>

              {/* Main Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* LEFT COLUMN: INPUTS */}
                <div className="lg:col-span-1 space-y-6">
                  
                  {/* Sales Metrics */}
                  <div className="bg-merchant-dark p-6 rounded-xl border border-merchant-gray shadow-xl">
                    <h2 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
                      <DollarSign className={cn("w-5 h-5 transition-colors", isProviderMode ? "text-blue-400" : "text-merchant-redLight")} /> 
                      Sales Metrics
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Total Monthly Volume ($)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-gray-500">$</span>
                          <input 
                            type="number" 
                            value={volume}
                            onChange={(e) => setVolume(Number(e.target.value))}
                            className="w-full bg-merchant-black border border-merchant-gray rounded-lg py-2 pl-7 pr-3 focus:outline-none focus:border-merchant-redLight text-white transition-colors"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Avg. Ticket Size ($)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-gray-500">$</span>
                          <input 
                            type="number" 
                            value={avgTicket}
                            onChange={(e) => setAvgTicket(Number(e.target.value))}
                            className="w-full bg-merchant-black border border-merchant-gray rounded-lg py-2 pl-7 pr-3 focus:outline-none focus:border-merchant-redLight text-white transition-colors"
                          />
                        </div>
                      </div>
                      <div className="pt-2 border-t border-merchant-gray">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Est. Transactions:</span>
                          <span className={cn("font-mono font-bold", isProviderMode ? "text-blue-400" : "text-merchant-redLight")}>
                            {transCount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Provider Config */}
                  {isProviderMode && (
                    <div className="bg-blue-900/20 p-6 rounded-xl border border-blue-800 shadow-xl relative overflow-hidden animate-in fade-in slide-in-from-top-4">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-blue-600 opacity-10 blur-2xl rounded-full pointer-events-none"></div>
                      <h2 className="text-lg font-semibold mb-4 text-blue-400 flex items-center gap-2">
                        <Server className="w-5 h-5" /> Buy Rates (Schedule A)
                      </h2>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-blue-200 mb-1">Buy Rate (%)</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={buyRatePercent}
                              onChange={(e) => setBuyRatePercent(Number(e.target.value))}
                              className="w-full bg-black/40 border border-blue-900/50 rounded-lg py-1.5 px-3 text-sm text-blue-100 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-blue-200 mb-1">Buy Per Item ($)</label>
                            <input 
                              type="number" 
                              step="0.01"
                              value={buyPerItem}
                              onChange={(e) => setBuyPerItem(Number(e.target.value))}
                              className="w-full bg-black/40 border border-blue-900/50 rounded-lg py-1.5 px-3 text-sm text-blue-100 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-blue-200 mb-1">Buy Monthly ($)</label>
                            <input 
                              type="number" 
                              value={buyMonthly}
                              onChange={(e) => setBuyMonthly(Number(e.target.value))}
                              className="w-full bg-black/40 border border-blue-900/50 rounded-lg py-1.5 px-3 text-sm text-blue-100 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-blue-200 mb-1">Buy AVS ($)</label>
                            <input 
                              type="number" 
                              value={buyAvs}
                              onChange={(e) => setBuyAvs(Number(e.target.value))}
                              className="w-full bg-black/40 border border-blue-900/50 rounded-lg py-1.5 px-3 text-sm text-blue-100 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-blue-200 mb-1">Split / Rev Share (%)</label>
                          <input 
                            type="number" 
                            step="1"
                            min="0"
                            max="100"
                            value={splitPercent}
                            onChange={(e) => setSplitPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                            className="w-full bg-black/40 border border-blue-900/50 rounded-lg py-1.5 px-3 text-sm text-blue-100 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Merchant Costs */}
                  {!isProviderMode && (
                    <div className="bg-merchant-dark p-6 rounded-xl border border-merchant-gray shadow-xl">
                      <h2 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
                        <Package className="text-merchant-redLight w-5 h-5" /> Business Costs
                      </h2>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Cost of Goods Sold (COGS) %</label>
                        <div className="flex items-center gap-3">
                          <input 
                            type="range" 
                            min="0" max="100" 
                            value={cogsPercent}
                            onChange={(e) => setCogsPercent(Number(e.target.value))}
                            className="w-full h-2 bg-merchant-gray rounded-lg appearance-none cursor-pointer accent-merchant-redLight"
                          />
                          <span className="w-12 text-right font-mono text-sm text-white">{cogsPercent}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Operational Settings */}
                  <div className="bg-merchant-dark p-6 rounded-xl border border-merchant-gray shadow-xl">
                    <h2 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
                      <Sliders className={cn("w-5 h-5", isProviderMode ? "text-blue-400" : "text-merchant-redLight")} /> 
                      Fee Variables
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">AVS Checks (% of Trans)</label>
                        <div className="flex items-center gap-3">
                          <input 
                            type="range" 
                            min="0" max="100" 
                            value={avsPercent}
                            onChange={(e) => setAvsPercent(Number(e.target.value))}
                            className={cn("w-full h-2 bg-merchant-gray rounded-lg appearance-none cursor-pointer", isProviderMode ? "accent-blue-500" : "accent-merchant-redLight")}
                          />
                          <span className="w-12 text-right font-mono text-sm text-white">{avsPercent}%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Batches Per Month</label>
                        <input 
                          type="number" 
                          value={batches}
                          onChange={(e) => setBatches(Number(e.target.value))}
                          className="w-full bg-merchant-black border border-merchant-gray rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:border-merchant-redLight text-white transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: RESULTS */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Main Result Card */}
                  <div className="bg-gradient-to-br from-merchant-dark to-black p-6 md:p-8 rounded-xl border border-merchant-gray shadow-2xl relative overflow-hidden transition-all duration-500">
                    <div className={cn("absolute top-0 right-0 w-64 h-64 opacity-10 blur-3xl rounded-full pointer-events-none transition-colors duration-500", isProviderMode ? "bg-blue-600" : "bg-merchant-red")}></div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                      <div>
                        <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1">
                          {isProviderMode ? "Est. Monthly Residuals" : "Estimated Net Profit"}
                        </h3>
                        <div className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">
                          {isProviderMode ? formatCurrency(finalProviderProfit) : formatCurrency(merchantNetProfit)}
                        </div>
                        <div className="text-green-500 text-sm font-medium flex items-center gap-1">
                          {isProviderMode ? (
                            <><HandCoins className="w-4 h-4" /> Based on {splitPercent}% Split</>
                          ) : (
                            <><CheckCircle className="w-4 h-4" /> After all fees & COGS</>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col justify-center space-y-4 border-t md:border-t-0 md:border-l border-merchant-gray md:pl-8 pt-4 md:pt-0">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-gray-400 text-sm">Effective Markup Rate</span>
                            <span className="text-xl font-bold text-white">{effectiveRate.toFixed(2)}%</span>
                          </div>
                          <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={cn("h-full rounded-full transition-colors duration-300", isProviderMode ? "bg-blue-500" : "bg-merchant-redLight")}
                              style={{ width: `${Math.min(effectiveRate * 10, 100)}%` }}
                            ></div>
                          </div>
                          <div className="text-[10px] text-gray-500 text-right mt-1">Excludes Pass-through Interchange</div>
                        </div>

                        {isProviderMode && (
                          <div className="flex justify-between items-center border-t border-gray-800 pt-3">
                            <span className="text-blue-300 text-sm">Provider Basis Cost</span>
                            <span className="text-lg font-bold text-blue-100">{formatCurrency(totalBuyCost)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fee Breakdown Table */}
                  <div className="bg-merchant-dark rounded-xl border border-merchant-gray shadow-xl overflow-hidden">
                    <div className="p-4 bg-black/20 border-b border-merchant-gray flex justify-between items-center">
                      <h3 className="font-semibold text-white flex items-center gap-2">
                        <List className="w-4 h-4 text-gray-500" /> Fee Breakdown
                      </h3>
                      <span className={cn("text-xs px-2 py-1 rounded border transition-colors duration-300", 
                        isProviderMode ? "bg-blue-900/40 text-blue-400 border-blue-500/30" : "bg-merchant-red/20 text-merchant-redLight border-merchant-red/30"
                      )}>
                        {isProviderMode ? "Profit & Loss" : "Merchant Statement"}
                      </span>
                    </div>
                    
                    <div className="p-6 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-gray-500 border-b border-merchant-gray/50">
                          <tr>
                            <th className="text-left pb-3 font-medium">Description</th>
                            <th className="text-right pb-3 font-medium">Merchant Rate</th>
                            {isProviderMode && <th className="text-right pb-3 font-medium text-blue-400">Buy Rate</th>}
                            {isProviderMode && <th className="text-right pb-3 font-medium text-green-400">Margin</th>}
                            <th className="text-right pb-3 font-medium">Total Fees</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-merchant-gray/30 text-gray-300">
                          <tr>
                            <td className="py-3">
                              <div className="font-medium text-white">Discount Rate (Volume)</div>
                              <div className="text-xs text-gray-500">Markup on Volume</div>
                            </td>
                            <td className="text-right py-3">{(SELL_RATES.percent * 100).toFixed(2)} %</td>
                            {isProviderMode && <td className="text-right py-3 text-blue-300/80 font-mono">{(buyBpDecimal * 100).toFixed(2)} %</td>}
                            {isProviderMode && <td className="text-right py-3 text-green-400 font-mono">{formatCurrency(marginRate)}</td>}
                            <td className="text-right py-3 font-mono">{formatCurrency(feeRate)}</td>
                          </tr>
                          
                          <tr>
                            <td className="py-3">Transaction Fees</td>
                            <td className="text-right py-3">${SELL_RATES.perItem.toFixed(2)}</td>
                            {isProviderMode && <td className="text-right py-3 text-blue-300/80 font-mono">${buyPerItem.toFixed(2)}</td>}
                            {isProviderMode && <td className="text-right py-3 text-green-400 font-mono">{formatCurrency(marginTrans)}</td>}
                            <td className="text-right py-3 font-mono">{formatCurrency(feeTrans)}</td>
                          </tr>

                          <tr>
                            <td className="py-3">Batch Fees</td>
                            <td className="text-right py-3">${SELL_RATES.batchFee.toFixed(2)}</td>
                            {isProviderMode && <td className="text-right py-3 text-blue-300/80 font-mono">-</td>}
                            {isProviderMode && <td className="text-right py-3 text-green-400 font-mono">{formatCurrency(marginBatch)}</td>}
                            <td className="text-right py-3 font-mono">{formatCurrency(feeBatch)}</td>
                          </tr>

                          <tr>
                            <td className="py-3">AVS Fees</td>
                            <td className="text-right py-3">${SELL_RATES.avsFee.toFixed(2)}</td>
                            {isProviderMode && <td className="text-right py-3 text-blue-300/80 font-mono">${buyAvs.toFixed(2)}</td>}
                            {isProviderMode && <td className="text-right py-3 text-green-400 font-mono">{formatCurrency(marginAvs)}</td>}
                            <td className="text-right py-3 font-mono">{formatCurrency(feeAvs)}</td>
                          </tr>

                          <tr>
                            <td className="py-3">
                              <div className="font-medium text-white">Monthly Fixed Costs</div>
                              <div className="text-xs text-gray-500">Statement, Regulatory, Annual</div>
                            </td>
                            <td className="text-right py-3">-</td>
                            {isProviderMode && <td className="text-right py-3 text-blue-300/80 font-mono">${buyMonthly.toFixed(2)}</td>}
                            {isProviderMode && <td className="text-right py-3 text-green-400 font-mono">{formatCurrency(marginFixed)}</td>}
                            <td className="text-right py-3 font-mono">{formatCurrency(fixedMonthly)}</td>
                          </tr>
                        </tbody>
                        <tfoot className="border-t-2 border-merchant-gray">
                          <tr>
                            <td className="pt-4 font-bold text-white">Totals</td>
                            <td className="pt-4"></td>
                            {isProviderMode && <td className="pt-4"></td>}
                            {isProviderMode && <td className="pt-4 text-right font-bold text-green-500 font-mono">{formatCurrency(totalMargin)}</td>}
                            <td className={cn("pt-4 text-right font-bold text-xl font-mono transition-colors duration-300", isProviderMode ? "text-blue-400" : "text-merchant-redLight")}>{formatCurrency(totalRevenue)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-merchant-dark p-4 rounded-xl border border-merchant-gray text-center">
                      <div className="text-xs text-gray-500 mb-1">{isProviderMode ? "Gross Fee Revenue" : "Gross Revenue"}</div>
                      <div className="font-bold text-white text-lg">{formatCurrency(isProviderMode ? totalRevenue : volume)}</div>
                    </div>
                    
                    <div className="bg-merchant-dark p-4 rounded-xl border border-merchant-gray text-center relative overflow-hidden">
                      <div className="text-xs text-gray-500 mb-1">{isProviderMode ? "Buy Rate Costs" : "Total Costs"}</div>
                      <div className={cn("font-bold text-lg transition-colors duration-300", isProviderMode ? "text-blue-400" : "text-merchant-redLight")}>
                        {formatCurrency(isProviderMode ? totalBuyCost : totalRevenue + cogsCost)}
                      </div>
                    </div>
                    
                    <div className="bg-merchant-dark p-4 rounded-xl border border-merchant-gray text-center border-l-4 border-l-green-500">
                      <div className="text-xs text-gray-500 mb-1">Net {isProviderMode ? "Profit" : "Payout"}</div>
                      <div className="font-bold text-green-500 text-lg">
                        {formatCurrency(isProviderMode ? finalProviderProfit : merchantNetPayout)}
                      </div>
                    </div>
                  </div>

            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
};

export default RevenueCalculator;
