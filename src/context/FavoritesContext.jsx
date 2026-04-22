import { createContext, useContext, useState, useCallback } from 'react';
import { getFavorites, toggleFavorite as storageToggle } from '../utils/storage';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(() => getFavorites());

  const toggleFavorite = useCallback((item) => {
    storageToggle(item);
    setFavorites(getFavorites());
  }, []);

  const favoriteIds = new Set(favorites.map((f) => f.id));

  return (
    <FavoritesContext.Provider value={{ favorites, favoriteIds, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
