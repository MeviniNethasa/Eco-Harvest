// src/admin/AdminPortalScreen.tsx
//
// Phase 3 Desktop Admin Command Panel (design.md / admin.md)
// 240px Fixed Sidebar with seamless Tab switching across:
// - Screen A-01: Verification Request Desk (SLSI Certificate Audit)
// - Screen A-02: Active Escrow Ledger & Uber Logistics Tracker
// - Screen A-03: Ecosystem Health & Analytics Dashboard
// - Screen A-04: Help Desk & Disputes Resolution

import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminTheme } from './AdminTheme';
import VerificationDeskTab from './screens/VerificationDeskTab';
import EscrowLogisticsTab from './screens/EscrowLogisticsTab';
import EcosystemAnalyticsTab from './screens/EcosystemAnalyticsTab';
import HelpDeskTab from './screens/HelpDeskTab';

type AdminTab = 'VERIFICATION' | 'ESCROW' | 'ANALYTICS' | 'HELP_DESK';

interface NavItem {
  id: AdminTab;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  code: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'VERIFICATION',
    title: 'Verification Desk',
    subtitle: 'SLSI Certificate Audit',
    icon: 'document-text',
    code: 'A-01',
  },
  {
    id: 'ESCROW',
    title: 'Escrow & Uber Logistics',
    subtitle: 'Stripe Holds & Vehicle Fleet',
    icon: 'card',
    code: 'A-02',
  },
  {
    id: 'ANALYTICS',
    title: 'Ecosystem Analytics',
    subtitle: 'Health & Demand Gap Map',
    icon: 'bar-chart',
    code: 'A-03',
  },
  {
    id: 'HELP_DESK',
    title: 'Help Desk & Disputes',
    subtitle: 'Customer & Farmer Resolution',
    icon: 'headset',
    code: 'A-04',
  },
];

export default function AdminPortalScreen() {
  const [activeTab, setActiveTab] = useState<AdminTab>('VERIFICATION');
  const [lastRefreshed, setLastRefreshed] = useState<string>(
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  const handleRefresh = () => {
    setLastRefreshed(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
  };

  const handleExitAdmin = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.layoutContainer}>
        {/* ---------------- 240px Fixed Sidebar ---------------- */}
        <View style={styles.sidebar}>
          {/* Brand Header */}
          <View style={styles.sidebarHeader}>
            <View style={styles.brandIconWrapper}>
              <Ionicons name="leaf" size={20} color={AdminTheme.colorBrandEmerald} />
            </View>
            <View>
              <Text style={styles.brandTitle}>EcoHarvest</Text>
              <Text style={styles.brandSubtitle}>Admin Command Panel</Text>
            </View>
          </View>

          {/* Navigation Items */}
          <View style={styles.navGroup}>
            <Text style={styles.navSectionHeader}>Governance & Operations</Text>
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.navItem, isActive && styles.navItemActive]}
                  onPress={() => setActiveTab(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  <View
                    style={[
                      styles.navIconWrapper,
                      isActive && styles.navIconWrapperActive,
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={18}
                      color={isActive ? AdminTheme.colorBrandEmerald : AdminTheme.colorTextMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.navTitleRow}>
                      <Text style={[styles.navItemTitle, isActive && styles.navItemTitleActive]}>
                        {item.title}
                      </Text>
                      <Text style={[styles.navCodeBadge, isActive && styles.navCodeBadgeActive]}>
                        {item.code}
                      </Text>
                    </View>
                    <Text style={styles.navItemSubtitle} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* System Environment Status Pill */}
          <View style={styles.sidebarFooter}>
            <View style={styles.serverStatusCard}>
              <View style={styles.serverStatusHeader}>
                <View style={styles.livePulseDot} />
                <Text style={styles.serverStatusTitle}>System Online</Text>
              </View>
              <Text style={styles.serverSubtext}>Cluster: MongoDB Atlas Primary</Text>
              <Text style={styles.serverSubtext}>AI Vision: MPS Hardware Ready</Text>
            </View>

            <Pressable
              style={styles.exitBtn}
              onPress={handleExitAdmin}
              accessibilityRole="button"
              accessibilityLabel="Exit to Mobile App"
            >
              <Ionicons name="phone-portrait-outline" size={16} color={AdminTheme.colorTextMuted} />
              <Text style={styles.exitBtnText}>Mobile Marketplace</Text>
            </Pressable>
          </View>
        </View>

        {/* ---------------- Main Display Workspace ---------------- */}
        <View style={styles.mainWorkspace}>
          {/* Top Command Bar */}
          <View style={styles.topBar}>
            <View style={styles.breadcrumbWrapper}>
              <Text style={styles.breadcrumbParent}>Admin Console</Text>
              <Ionicons name="chevron-forward" size={14} color={AdminTheme.colorTextDim} />
              <Text style={styles.breadcrumbCurrent}>{activeNavItem.title}</Text>
              <View style={styles.screenBadge}>
                <Text style={styles.screenBadgeText}>Screen {activeNavItem.code}</Text>
              </View>
            </View>

            <View style={styles.topBarActions}>
              <Text style={styles.lastRefreshedText}>Synced at {lastRefreshed}</Text>
              <Pressable
                style={styles.refreshBtn}
                onPress={handleRefresh}
                accessibilityRole="button"
                accessibilityLabel="Refresh Data"
              >
                <Ionicons name="refresh" size={16} color={AdminTheme.colorTextMain} />
              </Pressable>
            </View>
          </View>

          {/* Active Screen Tab Mounting */}
          <View style={styles.tabContentContainer}>
            {activeTab === 'VERIFICATION' && <VerificationDeskTab key={lastRefreshed} />}
            {activeTab === 'ESCROW' && <EscrowLogisticsTab key={lastRefreshed} />}
            {activeTab === 'ANALYTICS' && <EcosystemAnalyticsTab key={lastRefreshed} />}
            {activeTab === 'HELP_DESK' && <HelpDeskTab key={lastRefreshed} />}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: AdminTheme.bgAdminDark },
  layoutContainer: { flex: 1, flexDirection: 'row', backgroundColor: AdminTheme.bgAdminDark },

  // Sidebar (240px)
  sidebar: {
    width: AdminTheme.sidebarWidth,
    backgroundColor: AdminTheme.bgPanelDark,
    borderRightWidth: 1,
    borderRightColor: AdminTheme.bgSurfaceBorder,
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
  },
  brandIconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: AdminTheme.colorEmeraldSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { color: AdminTheme.colorTextMain, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  brandSubtitle: { color: AdminTheme.colorTextDim, fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },

  navGroup: { gap: 6, marginTop: 16, flex: 1 },
  navSectionHeader: {
    color: AdminTheme.colorTextDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingBottom: 4,
    letterSpacing: 0.5,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: AdminTheme.colorEmeraldSubtle,
    borderWidth: 1,
    borderColor: AdminTheme.colorBrandEmerald,
  },
  navIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconWrapperActive: { backgroundColor: AdminTheme.colorEmeraldSubtle },
  navTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navItemTitle: { color: AdminTheme.colorTextMuted, fontSize: 12, fontWeight: '600' },
  navItemTitleActive: { color: AdminTheme.colorBrandEmerald, fontWeight: '700' },
  navCodeBadge: { color: AdminTheme.colorTextDim, fontSize: 9, fontWeight: '800' },
  navCodeBadgeActive: { color: AdminTheme.colorBrandEmerald },
  navItemSubtitle: { color: AdminTheme.colorTextDim, fontSize: 10, marginTop: 1 },

  sidebarFooter: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: AdminTheme.bgSurfaceBorder },
  serverStatusCard: {
    backgroundColor: AdminTheme.bgAdminDark,
    borderRadius: 6,
    padding: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  serverStatusHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  livePulseDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: AdminTheme.colorBrandEmerald },
  serverStatusTitle: { color: AdminTheme.colorBrandEmerald, fontSize: 11, fontWeight: '700' },
  serverSubtext: { color: AdminTheme.colorTextDim, fontSize: 9 },

  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgAdminDark,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  exitBtnText: { color: AdminTheme.colorTextMuted, fontSize: 11, fontWeight: '600' },

  // Main Display Workspace
  mainWorkspace: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: AdminTheme.bgAdminDark,
  },
  topBar: {
    height: 52,
    backgroundColor: AdminTheme.bgPanelDark,
    borderBottomWidth: 1,
    borderBottomColor: AdminTheme.bgSurfaceBorder,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breadcrumbWrapper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breadcrumbParent: { color: AdminTheme.colorTextDim, fontSize: 13, fontWeight: '500' },
  breadcrumbCurrent: { color: AdminTheme.colorTextMain, fontSize: 13, fontWeight: '700' },
  screenBadge: {
    backgroundColor: AdminTheme.bgAdminDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
  },
  screenBadgeText: { color: AdminTheme.colorBrandEmerald, fontSize: 10, fontWeight: '800' },

  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lastRefreshedText: { color: AdminTheme.colorTextDim, fontSize: 11 },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: AdminTheme.bgAdminDark,
    borderWidth: 1,
    borderColor: AdminTheme.bgSurfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabContentContainer: { flex: 1 },
});
