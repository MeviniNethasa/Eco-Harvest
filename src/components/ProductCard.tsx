// src/components/ProductCard.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Crop } from '../types';
import { addToCart } from '../utils/storage';

interface ProductCardProps {
  crop: Crop;
  onAddedToCart?: () => void;
}

const CARD_WIDTH = 171;
const IMAGE_HEIGHT = 120;

export default function ProductCard({ crop, onAddedToCart }: ProductCardProps) {
  const [quantity, setQuantity] = useState<number>(1);

  const decrement = () => setQuantity((prev) => Math.max(1, prev - 1));
  const increment = () => setQuantity((prev) => Math.min(99, prev + 1));

  const handleAddToCart = async () => {
    try {
      await addToCart(crop, quantity);
      onAddedToCart?.();
      Alert.alert(
        'Added to Cart',
        `${quantity} x ${crop.name} (${crop.unit}) added.`
      );
      setQuantity(1);
    } catch (error) {
      Alert.alert('Error', 'Could not add item to cart. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Image source={{ uri: crop.imageUrl }} style={styles.image} />

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {crop.name}
        </Text>

        <Text style={styles.price}>
          LKR {crop.pricePerUnit} / {crop.unit}
        </Text>

        <View
          style={[
            styles.badge,
            {
              backgroundColor: crop.isSLSIVerified ? '#15803D' : '#6B7280',
            },
          ]}
        >
          <Text style={styles.badgeText}>
            {crop.isSLSIVerified ? 'SLSI Verified' : 'Unverified'}
          </Text>
        </View>

        <View style={styles.stepperRow}>
          <View style={styles.stepper}>
            <TouchableOpacity
              onPress={decrement}
              style={styles.stepperButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="remove" size={16} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{quantity}</Text>
            <TouchableOpacity
              onPress={increment}
              style={styles.stepperButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={16} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.addButton} onPress={handleAddToCart}>
          <Text style={styles.addButtonText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#F4F4F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  body: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    color: '#111827',
  },
  price: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    color: '#111827',
    marginTop: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  stepperRow: {
    marginTop: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    minHeight: 36,
    paddingHorizontal: 8,
  },
  stepperButton: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  addButton: {
    marginTop: 8,
    backgroundColor: '#15803D',
    borderRadius: 6,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.25,
    color: '#FFFFFF',
  },
});