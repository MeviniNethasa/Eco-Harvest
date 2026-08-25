// src/admin/screens/EcosystemAnalyticsTab.tsx
//
// Screen A-04: Ecosystem Health & Analytics Dashboard
// 4-column metric header, YOLOv8 crop freshness quality index,
// and Regional Sri Lanka Supply & Demand Gap Map grid.

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminTheme } from '../AdminTheme';
import { adminApi } from '../../services/api';

interface RegionalSupplyDemand {
  region: string;
  coordinates: { latitude: number; longitude: number };
  bulkDemandCount: number;
  supplyVolumeKg: number;
  status: string;
  deficitCrops: string[];
  severityColor: string;
}

interface AnalyticsData {
  kpiSummary: {
    totalDailyVolumeLKR: number;
    volumeGrowthPercent: number;
    activeBulkSubscriptions: number;
    subscriptionGrowthPercent: number;
    meanFreshnessIndex: number;
    openSupportTickets: number;
    verifiedFarmerCount: number;
    totalFarmers: number;
  };
  freshnessBreakdown: {
    gradeAOrganic: number;
    gradeBStandard: number;
    defectiveStale: number;
  };
  regionalSupplyDemandMap: RegionalSupplyDemand[];
}

function formatLKR(val: number): string {
  return `LKR ${Math.round(val).toLocaleString('en-LK')}`;
}

export default function EcosystemAnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const res = await adminApi.getAnalyticsHealth();
      if (res && res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.warn('Admin analytics load notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (isLoading || !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AdminTheme.colorBrandEmerald} />
        <Text style={styles.loadingText}>Compiling Ecosystem Analytics...</Text>
      </View>
    );
  }

  const { kpiSummary, freshnessBreakdown, regionalSupplyDemandMap } = data;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.workspace}>
        {/* 1. 4-Column Metric Cards Header */}
        <View style={styles.metricGrid}>
          {/* Card 1: Total Daily Volume */}
          <View style={styles.metricCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.metricLabel}>Total Daily Volume</Text>
              <View style={[styles.iconCircle, { backgroundColor: AdminTheme.colorEmeraldSubtle }]}>
                <Ionicons name="trending-up" size={18} color={AdminTheme.colorBrandEmerald} />
              </View>
            </View>
            <Text style={styles.metricValue}>{formatLKR(kpiSummary.totalDailyVolumeLKR)}</Text>
            <View style={styles.growthRow}>
              <Ionicons name="arrow-up" size={12} color={AdminTheme.colorBrandEmerald} />
              <Text style={styles.growthText}>+{kpiSummary.volumeGrowthPercent}% from yesterday</Text>
            </View>
          </View>

          {/* Card 2: Active Subscriptions */}
          <View style={styles.metricCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.metricLabel}>Active Bulk Subscriptions</Text>
              <View style={[styles.iconCircle, { backgroundColor: AdminTheme.colorPurpleSubtle }]}>
                <Ionicons name="sparkles" size={18} color={AdminTheme.colorPurple} />
              </View>
            </View>
            <Text style={styles.metricValue}>{kpiSummary.activeBulkSubscriptions}</Text>
            <View style={styles.growthRow}>
              <Ionicons name="arrow-up" size={12} color={AdminTheme.colorBrandEmerald} />
              <Text style={styles.growthText}>+{kpiSummary.subscriptionGrowthPercent}% monthly MRR</Text>
            </View>
          </View>

          {/* Card 3: Freshness Quality Index */}
          <View style={styles.metricCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.metricLabel}>Mean Freshness Index</Text>
              <View style={[styles.iconCircle, { backgroundColor: AdminTheme.colorEmeraldSubtle }]}>
                <Ionicons name="leaf" size={18} color={AdminTheme.colorBrandEmerald} />
              </View>
            </View>
            <Text style={styles.metricValue}>{kpiSummary.meanFreshnessIndex}%</Text>
            <View style={styles.growthRow}>
              <Ionicons name="checkmark-circle" size={12} color={AdminTheme.colorBrandEmerald} />
              <Text style={styles.qualitySubtext}>SLSI Grade A Verified Mean</Text>
            </View>
          </View>

          {/* Card 4: Open Support & Flag Tickets */}
          <View style={styles.metricCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.metricLabel}>Open Governance Tickets</Text>
              <View style={[styles.iconCircle, { backgroundColor: AdminTheme.colorCrimsonSubtle }]}>
                <Ionicons name="shield" size={18} color={AdminTheme.colorAlertCrimson} />
              </View>
            </View>
            <Text style={[styles.metricValue, { color: AdminTheme.colorAlertCrimson }]}>
              {kpiSummary.openSupportTickets}
            </Text>
            <View style={styles.growthRow}>
              <Text style={styles.ticketSubtext}>Escrow holds & chat flags</Text>
            </View>
          </View>
        </View>

        {/* 2. Split 2-Column Section */}
        <View style={styles.splitSection}>
          {/* Left Column: Regional Sri Lanka Supply & Demand Gap Map */}
          <View style={styles.mapCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="map" size={18} color={AdminTheme.colorBrandEmerald} />
              <Text style={styles.sectionTitle}>
                Regional Sri Lanka Supply & Demand Gap Map
              </Text>
            </View>
            <Text style={styles.sectionSubtitle}>
              Real-time synchronization of customer bulk extractions vs. verified farm inventories.
            </Text>

            <View style={styles.regionGrid}>
              {regionalSupplyDemandMap.map((reg, idx) => (
                <View key={idx} style={styles.regionBox}>
                  <View style={styles.regionHeader}>
                    <Text style={styles.regionName}>{reg.region}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        { borderColor: reg.severityColor },
                      ]}
                    >
                      <Text style={[styles.statusPillText, { color: reg.severityColor }]}>
                        {reg.status.replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.regionMetrics}>
                    <View style={styles.regionMetricCol}>
                      <Text style={styles.regMetricLabel}>Bulk Requests</Text>
                      <Text style={styles.regMetricVal}>{reg.bulkDemandCount} active</Text>
                    </View>
                    <View style={styles.regionMetricCol}>
                      <Text style={styles.regMetricLabel}>Supply Available</Text>
                      <Text style={styles.regMetricVal}>
                        {(reg.supplyVolumeKg / 1000).toFixed(0)} MT
                      </Text>
                    </View>
                  </View>

                  {reg.deficitCrops.length > 0 ? (
                    <View style={styles.deficitRow}>
                      <Text style={styles.deficitLabel}>Deficit Alert:</Text>
                      <Text style={styles.deficitList}>
                        {reg.deficitCrops.join(', ')}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.surplusRow}>
                      <Ionicons name="checkmark-circle" size={12} color={AdminTheme.colorBrandEmerald} />
                      <Text style={styles.surplusText}>Supply adequately meets buyer demand</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Right Column: AI Freshness Distribution & Platform Health */}
          <View style={styles.freshnessCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="analytics" size={18} color={AdminTheme.colorInfoBlue} />
              <Text style={styles.sectionTitle}>
                YOLOv8 Computer Vision Quality Distribution
              </Text>
            </View>
            <Text style={styles.sectionSubtitle}>
              Aggregate quality grades derived from harvest intake and delivery inspections.
            </Text>

            <View style={styles.barBlock}>
              <View style={styles.barHeader}>
                <Text style={styles.barLabel}>Grade A (SLSI Organic Compliant &ge; 80%)</Text>
                <Text style={[styles.barVal, { color: AdminTheme.colorBrandEmerald }]}>
                  {freshnessBreakdown.gradeAOrganic}%
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${freshnessBreakdown.gradeAOrganic}%`,
                      backgroundColor: AdminTheme.colorBrandEmerald,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.barBlock}>
              <View style={styles.barHeader}>
                <Text style={styles.barLabel}>Grade B (Standard Commercial Grade 70-79%)</Text>
                <Text style={[styles.barVal, { color: AdminTheme.colorWarningAmber }]}>
                  {freshnessBreakdown.gradeBStandard}%
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${freshnessBreakdown.gradeBStandard}%`,
                      backgroundColor: AdminTheme.colorWarningAmber,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.barBlock}>
              <View style={styles.barHeader}>
                <Text style={styles.barLabel}>{'Defective / Stale (< 70%)'}</Text>
                <Text style={[styles.barVal, { color: AdminTheme.colorAlertCrimson }]}>
                  {freshnessBreakdown.defectiveStale}%
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${freshnessBreakdown.defectiveStale}%`,
                      backgroundColor: AdminTheme.colorAlertCrimson,
                    },
                  ]}
                />
              </View>
            </View>

            {/* Merchant Network Health Card */}
            <View style={styles.merchantHealthBox}>
              <Text style={styles.boxHeader}>Registered Farm Network</Text>
              <View style={styles.healthRow}>
                <Text style={styles.healthLabel}>SLSI Verified Merchants:</Text>
                <Text style={styles.healthVal}>
                  {kpiSummary.verifiedFarmerCount} / {kpiSummary.totalFarmers} (
                  {Math.round((kpiSummary.verifiedFarmerCount / kpiSummary.totalFarmers) * 100)}%)
                </Text>
              </View>
              <View style={styles.healthRow}>
                <Text style={styles.healthLabel}>Dispute Ratio:</Text>
                <Text style={[styles.healthVal, { color: AdminTheme.colorBrandEmerald }]}>0.18% (Optimal)</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AdminTheme.bgAdminDark },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AdminTheme.bgAdminDark },
  loadingText: { color: AdminTheme.colorTextMuted, marginTop: 12, fontSize: 14 },

  workspace: { padding: 20, gap: 20 },

  // 1. Metric Cards Header
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: AdminTheme.cardBorderRadius,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    padding: 16,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricLabel: { color: AdminTheme.colorTextDim, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  metricValue: { color: AdminTheme.colorTextMain, fontSize: 22, fontWeight: '800' },
  growthRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  growthText: { color: AdminTheme.colorBrandEmerald, fontSize: 11, fontWeight: '600' },
  qualitySubtext: { color: AdminTheme.colorInfoBlue, fontSize: 11, fontWeight: '600' },
  ticketSubtext: { color: AdminTheme.colorTextDim, fontSize: 11 },

  // 2. Split Section
  splitSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  mapCard: {
    flex: 1.4,
    minWidth: 380,
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: AdminTheme.cardBorderRadius,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    padding: 18,
    gap: 14,
  },
  freshnessCard: {
    flex: 1,
    minWidth: 320,
    backgroundColor: AdminTheme.bgPanelDark,
    borderRadius: AdminTheme.cardBorderRadius,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    padding: 18,
    gap: 16,
  },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: AdminTheme.colorTextMain, fontSize: 15, fontWeight: '700' },
  sectionSubtitle: { color: AdminTheme.colorTextDim, fontSize: 12, marginTop: -4 },

  regionGrid: { gap: 10 },
  regionBox: {
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    gap: 8,
  },
  regionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  regionName: { color: AdminTheme.colorTextMain, fontSize: 13, fontWeight: '700' },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  statusPillText: { fontSize: 10, fontWeight: '800' },

  regionMetrics: { flexDirection: 'row', gap: 24 },
  regionMetricCol: { gap: 2 },
  regMetricLabel: { color: AdminTheme.colorTextDim, fontSize: 11 },
  regMetricVal: { color: AdminTheme.colorTextMain, fontSize: 12, fontWeight: '600' },

  deficitRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deficitLabel: { color: AdminTheme.colorAlertCrimson, fontSize: 11, fontWeight: '700' },
  deficitList: { color: AdminTheme.colorAlertCrimson, fontSize: 11 },
  surplusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  surplusText: { color: AdminTheme.colorBrandEmerald, fontSize: 11 },

  // Progress Bars
  barBlock: { gap: 6 },
  barHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { color: AdminTheme.colorTextMuted, fontSize: 12, fontWeight: '500' },
  barVal: { fontSize: 13, fontWeight: '700' },
  progressBarTrack: {
    height: 8,
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  progressBarFill: { height: '100%', borderRadius: 4 },

  merchantHealthBox: {
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    gap: 8,
    marginTop: 4,
  },
  boxHeader: { color: AdminTheme.colorTextMain, fontSize: 13, fontWeight: '700' },
  healthRow: { flexDirection: 'row', justifyContent: 'space-between' },
  healthLabel: { color: AdminTheme.colorTextDim, fontSize: 12 },
  healthVal: { color: AdminTheme.colorTextMain, fontSize: 12, fontWeight: '600' },
});
