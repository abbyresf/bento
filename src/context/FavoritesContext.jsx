import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getFavorites, toggleFavorite as dbToggle } from '../lib/db';

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    getFavorites().then(setFavorites);
  }, []);

  const toggleFavorite = useCallback(async (item) => {
    await dbToggle(item);
    setFavorites(await getFavorites());
  }, []);

  const favoriteIds = new Set(favorites.map((f) => f.id));

  return (
    <FavoritesContext.Provider value={{ favorites, favoriteIds, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFavorites() {
  return useContext(FavoritesContext);
}
