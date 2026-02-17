import React from 'react';
import '../styles/ProductCard.css';

const CATEGORY_ICONS = {
  "Women's Shoes": '\uD83D\uDC60',
  "Men's Clothing": '\uD83D\uDC54',
  "Women's Clothing": '\uD83D\uDC57',
  "Electronics": '\uD83D\uDCF1',
  "Home & Kitchen": '\uD83C\uDFE0',
  "Athletic": '\uD83C\uDFC3',
  "Accessories": '\uD83D\uDC5C',
  "Beauty": '\u2728',
  "Outdoor & Fitness": '\uD83C\uDFCB\uFE0F',
};

const ProductCard = ({ product, onAddToCart }) => {
  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const getBrand = () => {
    if (product.attributes && product.attributes.brand) {
      return product.attributes.brand;
    }
    return '';
  };

  const getStockStatus = () => {
    if (product.stock > 10) {
      return <span className="stock in-stock">In Stock</span>;
    } else if (product.stock > 0) {
      return <span className="stock low-stock">Only {product.stock} left</span>;
    }
    return <span className="stock out-of-stock">Out of Stock</span>;
  };

  const renderStars = (rating) => {
    const full = Math.floor(rating);
    const empty = 5 - full;
    return '\u2605'.repeat(full) + '\u2606'.repeat(empty);
  };

  const placeholderIcon = CATEGORY_ICONS[product.category] || '\uD83D\uDCE6';
  const outOfStock = product.stock <= 0;

  return (
    <div className="product-card">
      <div className="product-image">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} />
        ) : (
          <div className="product-image-placeholder">
            {placeholderIcon}
          </div>
        )}
      </div>

      <div className="product-details">
        <div className="product-brand">{getBrand()}</div>
        <h3 className="product-name">{product.name}</h3>

        <div className="product-rating">
          <span className="stars">{renderStars(product.rating)}</span>
          <span className="rating-text">
            {product.rating} ({product.review_count || 0} reviews)
          </span>
        </div>

        <div className="product-price-row">
          <span className="product-price">{formatPrice(product.price)}</span>
          {getStockStatus()}
        </div>

        {product.key_features && product.key_features.length > 0 && (
          <ul className="product-features">
            {product.key_features.slice(0, 3).map((feature, index) => (
              <li key={index}>{feature}</li>
            ))}
          </ul>
        )}

        <button
          className="add-to-cart-btn"
          disabled={outOfStock}
          onClick={() => onAddToCart && onAddToCart(product.id)}
        >
          {outOfStock ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
};

export default ProductCard;
