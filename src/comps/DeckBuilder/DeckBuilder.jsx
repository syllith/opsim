import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, AppBar, Toolbar, IconButton, Typography, Box, TextField, InputAdornment, Button, Divider, List, ListItemButton, ListItemText, Grid, Paper, Chip, Stack, Tooltip, Badge, Snackbar, Alert, MenuItem, DialogTitle, DialogContent, DialogContentText, DialogActions, FormControlLabel, Switch, Pagination, Checkbox } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VerifiedIcon from '@mui/icons-material/Verified';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ShieldIcon from '@mui/icons-material/Shield';
import PaletteIcon from '@mui/icons-material/Palette';
import CategoryIcon from '@mui/icons-material/Category';
import LabelIcon from '@mui/icons-material/Label';
import StyleIcon from '@mui/icons-material/Style';
import BoltIcon from '@mui/icons-material/Bolt';
import ArticleIcon from '@mui/icons-material/Article';
import { loadAllCards, cardImageUrl, parseDeckText, formatDeckText, validateDeck } from '../../data/cards/loader';
import { listDecks, saveDeck, getDeck, deleteDeck } from '../../utils/deckApi';

const CARD_W = 120;
const CARD_H = 167;
const OVERLAP_OFFSET = 22;
const STACK_MAX_H = CARD_H + 3 * OVERLAP_OFFSET; // up to 4 cards stacked

function StatRow({ label, value }) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  if (!text) return null;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', py: 0.25, gap: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ flex: '0 0 40%' }}>{label}</Typography>
      <Typography variant="body2" sx={{ flex: 1, textAlign: 'right', wordBreak: 'break-word' }}>{text}</Typography>
    </Box>
  );
}

function colorChipSx(colorName) {
  switch (colorName) {
    case 'Red':
      return { bgcolor: 'error.main', color: 'error.contrastText' };
    case 'Green':
      return { bgcolor: 'success.main', color: 'success.contrastText' };
    case 'Blue':
      return { bgcolor: 'info.main', color: 'info.contrastText' };
    case 'Yellow':
      return { bgcolor: 'warning.main', color: 'warning.contrastText' };
    case 'Purple':
      return { bgcolor: 'secondary.main', color: 'secondary.contrastText' };
    case 'Black':
      return { bgcolor: 'grey.900', color: 'common.white' };
    default:
      return {};
  }
}

function CardTile({ card, onAdd, onShow, editMode, onEdit, onToggleVerified }) {
  const handleClick = () => {
    if (editMode) {
      onEdit(card);
    } else {
      onAdd(card);
    }
  };
  
  return (
    <Paper
      variant="outlined"
      sx={{ 
        p: 0.5, 
        cursor: 'pointer', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        mx: 'auto', 
        maxWidth: 120,
        position: 'relative',
        border: editMode ? '2px solid' : undefined,
        borderColor: editMode ? 'warning.main' : undefined
      }}
      onClick={handleClick}
      onMouseEnter={() => onShow(card)}
      onMouseLeave={() => onShow(null)}
    >
      <img src={cardImageUrl(card)} alt={card.id} style={{ width: 120, height: 'auto', display: 'block', borderRadius: 4 }} />
      {card?.verified && (
        <Box sx={{ position: 'absolute', inset: 4, bgcolor: 'rgba(76, 175, 80, 0.4)', borderRadius: 1, pointerEvents: 'none' }} />
      )}
      {card?.verified ? (
        <Tooltip title="Verified">
          <VerifiedIcon sx={{ position: 'absolute', bottom: 4, left: 4, color: 'success.main', bgcolor: 'rgba(255,255,255,0.95)', borderRadius: '8px', p: 0.5, fontSize: 20, boxShadow: 2 }} />
        </Tooltip>
      ) : null}
      {editMode && (
        <>
          <EditIcon 
            sx={{ 
              position: 'absolute', 
              top: 4, 
              right: 4, 
              color: 'warning.main',
              bgcolor: 'rgba(255,255,255,0.9)',
              borderRadius: '50%',
              p: 0.25,
              fontSize: 20
            }} 
          />
          <Box sx={{ position: 'absolute', top: 2, left: 2, bgcolor: card?.verified ? '#c8e6c9' : '#e0e0e0', borderRadius: 1, px: 0.5, py: 0.1, boxShadow: 1, border: card?.verified ? '1px solid #4caf50' : '1px solid #333', display: 'flex', alignItems: 'center', gap: 0.25, minHeight: 22 }} onClick={(e) => e.stopPropagation()}>
            <Checkbox 
              size="small" 
              checked={!!card?.verified} 
              onChange={(e) => onToggleVerified && onToggleVerified(card, e.target.checked)}
              sx={{ color: 'success.main', p: 0.2 }}
            />
            <Typography variant="caption" sx={{ color: '#111', fontWeight: 600, fontSize: '0.75rem', letterSpacing: 0.1 }}>Verified</Typography>
          </Box>
        </>
      )}
    </Paper>
  );
}

function DeckGridItem({ card, count, onInc, onDec, onShow }) {
  return (
    <Box
      sx={{ position: 'relative', width: CARD_W, height: STACK_MAX_H, mx: 'auto', borderRadius: 1, overflow: 'visible', boxShadow: 'none', backgroundColor: 'transparent', '&:hover .deck-actions': { opacity: 1 } }}
      onMouseEnter={() => onShow(card)}
      onMouseLeave={() => onShow(null)}
    >
      {/* Stacked images, top-aligned so stack grows downward */}
      {Array.from({ length: count }, (_, i) => i).reverse().map((i) => (
        <img
          key={i}
          src={cardImageUrl(card)}
          alt={card.id}
          style={{ position: 'absolute', top: i * OVERLAP_OFFSET, left: 0, width: CARD_W, height: 'auto', borderRadius: 4 }}
        />
      ))}
      <Badge badgeContent={count} color="primary" sx={{ position: 'absolute', top: 6, right: 6, cursor: 'default' }} />
      <Box
        className="deck-actions"
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 1,
          p: 1,
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)',
          opacity: 0,
          transition: 'opacity 120ms ease',
        }}
      >
        <Button size="small" variant="contained" color="primary" onClick={onDec} sx={{ minWidth: 36, px: 0 }}>-</Button>
        <Button size="small" variant="contained" color="primary" onClick={onInc} sx={{ minWidth: 36, px: 0 }}>+</Button>
      </Box>
    </Box>
  );
}

function CardEditorDialog({ open, card, onClose, onSave }) {
  const [editedData, setEditedData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (card && open) {
      setEditedData(JSON.parse(JSON.stringify(card))); // deep clone
    }
  }, [card, open]);

  const updateField = (path, value) => {
    setEditedData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let current = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return updated;
    });
  };

  const updateArrayField = (path, index, value) => {
    setEditedData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let current = updated;
      for (let i = 0; i < keys.length; i++) {
        current = current[keys[i]];
      }
      current[index] = value;
      return updated;
    });
  };

  const addArrayItem = (path, defaultValue = '') => {
    setEditedData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let current = updated;
      for (let i = 0; i < keys.length; i++) {
        current = current[keys[i]];
      }
      if (Array.isArray(current)) {
        current.push(defaultValue);
      }
      return updated;
    });
  };

  const removeArrayItem = (path, index) => {
    setEditedData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let current = updated;
      for (let i = 0; i < keys.length; i++) {
        current = current[keys[i]];
      }
      if (Array.isArray(current)) {
        current.splice(index, 1);
      }
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(card.id, editedData);
    } finally {
      setSaving(false);
    }
  };

  if (!card) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xl" 
      fullWidth
      PaperProps={{ sx: { height: '95vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2, pb: 1 }}>
        <EditIcon color="warning" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6">Edit Card: {editedData.id}</Typography>
          <Typography variant="caption" color="text.secondary">{editedData.name}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ display: 'flex', gap: 3, p: 2, overflow: 'hidden' }}>
        {/* Left: Card Image */}
        <Box sx={{ flex: '0 0 400px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img 
            src={cardImageUrl(card)} 
            alt={card.id} 
            style={{ 
              width: '100%', 
              height: 'auto', 
              maxHeight: '650px',
              objectFit: 'contain',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }} 
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
            {editedData.id}
          </Typography>
        </Box>

        {/* Right: Form Fields */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'auto' }}>
          <Stack spacing={2.5}>
            {/* Basic Info */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CategoryIcon fontSize="small" /> Basic Information
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Checkbox checked={!!editedData.verified} onChange={(e) => updateField('verified', e.target.checked)} />}
                    label="Verified"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="ID" value={editedData.id || ''} onChange={(e) => updateField('id', e.target.value)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Set" value={editedData.set || ''} onChange={(e) => updateField('set', e.target.value)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Number" type="number" value={editedData.number || ''} onChange={(e) => updateField('number', parseInt(e.target.value) || 0)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Name" value={editedData.name || ''} onChange={(e) => updateField('name', e.target.value)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Category" select value={editedData.category || ''} onChange={(e) => updateField('category', e.target.value)}>
                    <MenuItem value="Leader">Leader</MenuItem>
                    <MenuItem value="Character">Character</MenuItem>
                    <MenuItem value="Event">Event</MenuItem>
                    <MenuItem value="Stage">Stage</MenuItem>
                    <MenuItem value="Don">Don</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Attribute" value={editedData.attribute || ''} onChange={(e) => updateField('attribute', e.target.value || null)} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Rarity" value={editedData.rarity || ''} onChange={(e) => updateField('rarity', e.target.value || null)} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Art Path" value={editedData.art || ''} onChange={(e) => updateField('art', e.target.value || null)} />
                </Grid>
              </Grid>
            </Paper>

            {/* Colors Array */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PaletteIcon fontSize="small" /> Colors
              </Typography>
              <Stack spacing={1}>
                {(editedData.colors || []).map((color, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1 }}>
                    <TextField fullWidth size="small" select value={color} onChange={(e) => updateArrayField('colors', idx, e.target.value)}>
                      <MenuItem value="Red">Red</MenuItem>
                      <MenuItem value="Green">Green</MenuItem>
                      <MenuItem value="Blue">Blue</MenuItem>
                      <MenuItem value="Black">Black</MenuItem>
                      <MenuItem value="Purple">Purple</MenuItem>
                      <MenuItem value="Yellow">Yellow</MenuItem>
                    </TextField>
                    <IconButton size="small" color="error" onClick={() => removeArrayItem('colors', idx)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
                <Button size="small" variant="outlined" onClick={() => addArrayItem('colors', 'Red')}>+ Add Color</Button>
              </Stack>
            </Paper>

            {/* Types Array */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <StyleIcon fontSize="small" /> Types
              </Typography>
              <Stack spacing={1}>
                {(editedData.types || []).map((type, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1 }}>
                    <TextField fullWidth size="small" value={type} onChange={(e) => updateArrayField('types', idx, e.target.value)} />
                    <IconButton size="small" color="error" onClick={() => removeArrayItem('types', idx)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
                <Button size="small" variant="outlined" onClick={() => addArrayItem('types', '')}>+ Add Type</Button>
              </Stack>
            </Paper>

            {/* Stats */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <FitnessCenterIcon fontSize="small" /> Stats
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small" label="Cost" type="number" value={editedData.stats?.cost ?? ''} onChange={(e) => updateField('stats.cost', e.target.value ? parseInt(e.target.value) : null)} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small" label="Power" type="number" value={editedData.stats?.power ?? ''} onChange={(e) => updateField('stats.power', e.target.value ? parseInt(e.target.value) : null)} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small" label="Life" type="number" value={editedData.stats?.life ?? ''} onChange={(e) => updateField('stats.life', e.target.value ? parseInt(e.target.value) : null)} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth size="small" label="Counter Value" type="number" value={editedData.stats?.counter?.value ?? 0} onChange={(e) => updateField('stats.counter.value', parseInt(e.target.value) || 0)} />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={<Switch checked={editedData.stats?.counter?.present || false} onChange={(e) => updateField('stats.counter.present', e.target.checked)} />}
                    label="Has Counter"
                  />
                </Grid>
              </Grid>
            </Paper>

            {/* Keywords Array */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LabelIcon fontSize="small" /> Keywords
              </Typography>
              <Stack spacing={1}>
                {(editedData.keywords || []).map((keyword, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1 }}>
                    <TextField fullWidth size="small" value={keyword} onChange={(e) => updateArrayField('keywords', idx, e.target.value)} />
                    <IconButton size="small" color="error" onClick={() => removeArrayItem('keywords', idx)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
                <Button size="small" variant="outlined" onClick={() => addArrayItem('keywords', '')}>+ Add Keyword</Button>
              </Stack>
            </Paper>

            {/* Trigger */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <BoltIcon fontSize="small" /> Trigger
              </Typography>
              <FormControlLabel
                control={<Switch checked={!!editedData.trigger} onChange={(e) => updateField('trigger', e.target.checked ? { text: '' } : null)} />}
                label="Has Trigger"
                sx={{ mb: 1 }}
              />
              {editedData.trigger && (
                <TextField 
                  fullWidth 
                  multiline 
                  rows={3} 
                  size="small" 
                  label="Trigger Text" 
                  value={editedData.trigger?.text || ''} 
                  onChange={(e) => updateField('trigger.text', e.target.value)} 
                />
              )}
            </Paper>

            {/* Card Text */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ArticleIcon fontSize="small" /> Card Text
              </Typography>
              <TextField 
                fullWidth 
                multiline 
                rows={4} 
                size="small" 
                value={editedData.text || ''} 
                onChange={(e) => updateField('text', e.target.value || null)} 
              />
            </Paper>

            {/* Meta Notes */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                Meta / Notes
              </Typography>
              <TextField 
                fullWidth 
                multiline 
                rows={2} 
                size="small" 
                label="Internal Notes" 
                value={editedData.meta?.notes || ''} 
                onChange={(e) => updateField('meta.notes', e.target.value || null)} 
              />
            </Paper>
          </Stack>
        </Box>
      </DialogContent>
      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} variant="outlined">
          Cancel
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          color="warning"
          disabled={saving}
          startIcon={saving ? null : <SaveIcon />}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function DeckBuilder({ open, onClose }) {
  const [all, setAll] = useState([]);
  const [byId, setById] = useState(new Map());
  const [bySet, setBySet] = useState({});
  const [setKey, setSetKey] = useState('All');
  const [query, setQuery] = useState('');
  const defaultFilter = {
    category: 'All',
    color: 'All',
    cost: 'Any',
    attribute: 'Any',
    trigger: 'Any',
    counter: 'Any',
    blocker: 'Any',
    verified: 'Any',
  };
  const [filter, setFilter] = useState(defaultFilter);
  const [hoverCard, setHoverCard] = useState(null);
  const [leaderId, setLeaderId] = useState('');
  const [deckMap, setDeckMap] = useState(new Map()); // id -> count
  const [deckName, setDeckName] = useState('My Deck');
  const [copyState, setCopyState] = useState('');
  const [message, setMessage] = useState('');
  const [leftW, setLeftW] = useState(240);
  const [rightW, setRightW] = useState(420);
  const dragRef = useRef({ side: null, startX: 0, startW: 0, containerW: 0 });
  const middleRef = useRef(null);
  const midLeftRef = useRef(null);
  const [midLeftW, setMidLeftW] = useState(null); // px; null means auto split
  const [confirmLeaderOpen, setConfirmLeaderOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { cards, byId: idMap, bySet: setMap } = await loadAllCards();
      setAll(cards);
      setById(idMap);
      setBySet(setMap);
      setSetKey((prev) => (prev === 'All' || setMap[prev] ? prev : (Object.keys(setMap)[0] || 'All')));
    })();
  }, [open]);

  const sets = useMemo(() => ['All', ...Object.keys(bySet).sort()], [bySet]);

  // Distinct value lists for dynamic filters
  const costList = useMemo(() => Array.from(new Set(all.map((c) => c?.stats?.cost).filter((v) => v !== null && v !== undefined))).sort((a, b) => a - b), [all]);
  const attributeList = useMemo(() => Array.from(new Set(all.map((c) => c.attribute).filter((v) => !!v))).sort(), [all]);

  const filterCard = (c) => {
    const q = query.trim().toLowerCase();
    if (q && !(c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))) return false;
    if (filter.category !== 'All' && c.category !== filter.category) return false;
    if (filter.color !== 'All' && !(c.colors || []).includes(filter.color)) return false;
    if (filter.cost !== 'Any' && c?.stats?.cost !== Number(filter.cost)) return false;
    if (filter.attribute !== 'Any' && c.attribute !== filter.attribute) return false;
    if (filter.trigger === 'Yes' && !c.trigger) return false;
    if (filter.trigger === 'No' && c.trigger) return false;
    if (filter.counter === 'Yes' && !c?.stats?.counter?.present) return false;
    if (filter.counter === 'No' && c?.stats?.counter?.present) return false;
    if (filter.blocker === 'Yes' && !(c.keywords || []).includes('Blocker')) return false;
    if (filter.blocker === 'No' && (c.keywords || []).includes('Blocker')) return false;
    if (filter.verified === 'Verified' && !c?.verified) return false;
    if (filter.verified === 'Unverified' && !!c?.verified) return false;
    return true;
  };

  const listed = useMemo(() => {
    const pool = setKey === 'All' ? all : (bySet[setKey] || []);
    return pool.filter(filterCard);
  }, [all, bySet, setKey, query, filter]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(listed.length / PAGE_SIZE)), [listed]);
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return listed.slice(start, start + PAGE_SIZE);
  }, [listed, page]);

  useEffect(() => {
    // Reset pagination when filters/set change or page exceeds total
    setPage(1);
  }, [setKey, query, filter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const filteredCounts = useMemo(() => {
    const counts = {};
    const allFiltered = all.filter(filterCard);
    counts['All'] = allFiltered.length;
    Object.entries(bySet).forEach(([s, cards]) => {
      counts[s] = cards.filter(filterCard).length;
    });
    return counts;
  }, [all, bySet, query, filter]);

  const filtersActive = useMemo(() => {
    if (query.trim()) return true;
    return Object.keys(defaultFilter).some((k) => filter[k] !== defaultFilter[k]);
  }, [query, filter]);

  const clearFilters = () => {
    setQuery('');
    setFilter(defaultFilter);
  };

  const items = useMemo(() => Array.from(deckMap.entries()).map(([id, count]) => ({ id, count })), [deckMap]);
  const deckIssues = useMemo(() => validateDeck({ leaderId, items }, { byId }), [leaderId, items, byId]);
  const deckText = useMemo(() => formatDeckText(items), [items]);

  const addCard = (card) => {
    if (card.category === 'Leader') {
      setLeaderId(card.id);
      return;
    }
    setDeckMap((prev) => {
      const cur = new Map(prev);
      const n = Math.min(4, (cur.get(card.id) || 0) + 1);
      cur.set(card.id, n);
      return cur;
    });
  };
  const inc = (id) => setDeckMap((prev) => { const c = new Map(prev); c.set(id, Math.min(4, (c.get(id) || 0) + 1)); return c; });
  const dec = (id) => setDeckMap((prev) => { const c = new Map(prev); const n = Math.max(0, (c.get(id) || 0) - 1); if (n === 0) c.delete(id); else c.set(id, n); return c; });

  const importText = (text) => {
    const parsed = parseDeckText(text);
    const map = new Map();
    parsed.forEach(({ id, count }) => map.set(id, Math.min(4, count)));
    setDeckMap(map);
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(deckText);
      setCopyState('Copied to clipboard');
    } catch {
      setCopyState('Copy failed');
    }
  };

  const doSave = async () => {
    try {
      const payload = { name: deckName, leaderId, items, text: deckText };
      await saveDeck(payload);
      setMessage('Deck saved');
    } catch (e) {
      setMessage(e.message || 'Save failed');
    }
  };

  const rightList = useMemo(() => {
    const rows = items
      .map((it) => ({ ...it, card: byId.get(it.id) }))
      .filter((r) => !!r.card)
      .sort((a, b) => a.card.number - b.card.number);
    return rows;
  }, [items, byId]);

  const onDragStart = (e, side) => {
    if (side === 'middle') {
      const containerW = middleRef.current ? middleRef.current.offsetWidth : 0;
      const startW = midLeftRef.current ? midLeftRef.current.offsetWidth : 0;
      dragRef.current = { side, startX: e.clientX, startW, containerW };
    } else {
      dragRef.current = { side, startX: e.clientX, startW: side === 'left' ? leftW : rightW, containerW: 0 };
    }
    window.addEventListener('mousemove', onDragging);
    window.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  };
  const onDragging = (e) => {
    const { side, startX, startW, containerW } = dragRef.current;
    const dx = e.clientX - startX;
    if (side === 'left') setLeftW(Math.max(200, Math.min(500, startW + dx)));
    if (side === 'right') setRightW(Math.max(320, Math.min(640, startW - dx)));
    if (side === 'middle') {
      const minLeft = 280;
      const minRight = 320;
      const maxLeft = Math.max(minLeft, containerW - minRight);
      const next = Math.max(minLeft, Math.min(maxLeft, startW + dx));
      setMidLeftW(next);
    }
  };
  const onDragEnd = () => {
    window.removeEventListener('mousemove', onDragging);
    window.removeEventListener('mouseup', onDragEnd);
  };

  const saveCardEdit = async (cardId, updatedData) => {
    try {
      const response = await fetch('/api/cards/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, cardData: updatedData }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save');
      setMessage('Card saved successfully');

      // Reload live data so changes reflect instantly without full page refresh
      const { cards, byId: idMap, bySet: setMap } = await loadAllCards();
      setAll(cards);
      setById(idMap);
      setBySet(setMap);

      // Keep preview/hover up-to-date if the edited card is selected/hovered
      const updated = idMap.get(cardId);
      if (hoverCard && hoverCard.id === cardId && updated) setHoverCard(updated);
      if (editingCard && editingCard.id === cardId && updated) setEditingCard(updated);

      setEditorOpen(false);
    } catch (e) {
      setMessage(e.message || 'Failed to save card');
    }
  };

  return (
    <Dialog fullScreen open={open} onClose={onClose} PaperProps={{ sx: { display: 'flex', flexDirection: 'column' } }}>
      <AppBar sx={{ position: 'relative' }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={onClose} aria-label="close">
            <CloseIcon />
          </IconButton>
          <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
            Deck Builder
          </Typography>
          <FormControlLabel
            control={
              <Switch 
                checked={editMode} 
                onChange={(e) => setEditMode(e.target.checked)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: 'warning.main' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'warning.light' }
                }}
              />
            }
            label="Edit Mode"
            sx={{ 
              mr: 2,
              color: 'white',
              '& .MuiFormControlLabel-label': { fontSize: '0.875rem' }
            }}
          />
          <TextField
            size="small"
            sx={{
              mr: 2,
              bgcolor: 'white',
              borderRadius: 1,
              '& .MuiInputBase-input': { color: 'black' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,0,0,0.23)' },
              '& .MuiInputBase-input::placeholder': { color: 'rgba(0,0,0,0.6)' }
            }}
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="Deck name"
            disabled={editMode}
          />
          <Button color="inherit" startIcon={<SaveIcon />} onClick={doSave} disabled={editMode || !leaderId || items.reduce((a,b)=>a+b.count,0)!==50}>Save</Button>
        </Toolbar>
      </AppBar>

      {/* Content area fills below AppBar without causing whole-dialog scroll */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Sets list with filters anchored at bottom */}
        <Box sx={{ width: leftW, borderRight: '1px solid #ddd', p: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2">Sets</Typography>
            {filtersActive && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Chip label="Filtered" size="small" color="warning" variant="outlined" />
                <Button size="small" variant="text" onClick={clearFilters} sx={{ minWidth: 'auto', px: 1 }}>Clear</Button>
              </Stack>
            )}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', mb: 1 }}>
            <List dense>
              {sets.map((s) => {
                const count = filteredCounts[s] ?? 0;
                return (
                  <ListItemButton key={s} selected={s === setKey} onClick={() => setSetKey(s)} sx={{ opacity: count === 0 ? 0.4 : 1 }}>
                    <ListItemText primary={`${s} (${count})`} />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
          <Divider sx={{ mb: 1 }} />
          <Box sx={{ flexShrink: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Filters</Typography>
            <Stack spacing={1.75}>
              <TextField size="small" placeholder="Search name or ID" value={query} onChange={(e) => setQuery(e.target.value)} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small"/></InputAdornment>) }} />
              <TextField size="small" label="Verified" select value={filter.verified} onChange={(e) => setFilter({ ...filter, verified: e.target.value })}
                SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper' } } } }}>
                <MenuItem value="Any">Any</MenuItem>
                <MenuItem value="Verified">Verified</MenuItem>
                <MenuItem value="Unverified">Unverified</MenuItem>
              </TextField>
              <TextField size="small" label="Category" select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}
                SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper' } } } }}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Leader">Leader</MenuItem>
                <MenuItem value="Character">Character</MenuItem>
                <MenuItem value="Event">Event</MenuItem>
                <MenuItem value="Stage">Stage</MenuItem>
              </TextField>
              <TextField size="small" label="Color" select value={filter.color} onChange={(e) => setFilter({ ...filter, color: e.target.value })}
                SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper' } } } }}>
                <MenuItem value="All">All</MenuItem>
                <MenuItem value="Red">Red</MenuItem>
                <MenuItem value="Green">Green</MenuItem>
                <MenuItem value="Blue">Blue</MenuItem>
                <MenuItem value="Black">Black</MenuItem>
                <MenuItem value="Purple">Purple</MenuItem>
                <MenuItem value="Yellow">Yellow</MenuItem>
              </TextField>
              <TextField size="small" label="Cost" select value={filter.cost} onChange={(e) => setFilter({ ...filter, cost: e.target.value })}
                SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper' } } } }}>
                <MenuItem value="Any">Any</MenuItem>
                {costList.map((c) => <MenuItem key={c} value={String(c)}>{c}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Blocker" select value={filter.blocker} onChange={(e) => setFilter({ ...filter, blocker: e.target.value })}
                SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper' } } } }}>
                <MenuItem value="Any">Any</MenuItem>
                <MenuItem value="Yes">Yes</MenuItem>
                <MenuItem value="No">No</MenuItem>
              </TextField>
              <TextField size="small" label="Attribute" select value={filter.attribute} onChange={(e) => setFilter({ ...filter, attribute: e.target.value })}
                SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper' } } } }}>
                <MenuItem value="Any">Any</MenuItem>
                {attributeList.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Trigger" select value={filter.trigger} onChange={(e) => setFilter({ ...filter, trigger: e.target.value })}
                SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper' } } } }}>
                <MenuItem value="Any">Any</MenuItem>
                <MenuItem value="Yes">Yes</MenuItem>
                <MenuItem value="No">No</MenuItem>
              </TextField>
              <TextField size="small" label="Counter" select value={filter.counter} onChange={(e) => setFilter({ ...filter, counter: e.target.value })}
                SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'background.paper' } } } }}>
                <MenuItem value="Any">Any</MenuItem>
                <MenuItem value="Yes">Yes</MenuItem>
                <MenuItem value="No">No</MenuItem>
              </TextField>
            </Stack>
          </Box>
          <Box onMouseDown={(e) => onDragStart(e, 'left')} sx={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 2 }} />
        </Box>

        {/* Middle area: Card selector and Build column split 50/50 */}
        <Box ref={middleRef} sx={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden', position: 'relative' }}>
          {/* Cards grid with top pagination */}
          <Box ref={midLeftRef} sx={{ flex: midLeftW ? `0 0 ${midLeftW}px` : 1, p: 2, overflow: 'auto', minWidth: 0 }}>
            {/* Top pagination / status (sticky) */}
            <Box sx={{
              position: 'sticky',
              top: 0,
              zIndex: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1.5,
              pt: 0.5,
              pb: 0.5,
              bgcolor: 'background.paper',
              borderBottom: '1px solid',
              borderColor: 'divider'
            }}>
              <Typography variant="body2" color="text.secondary">
                {listed.length > 0
                  ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, listed.length)} of ${listed.length}`
                  : 'No results'}
              </Typography>
              {listed.length > 0 && (
                <Pagination
                  count={totalPages}
                  page={page}
                  color="primary"
                  size="small"
                  onChange={(_, p) => setPage(p)}
                  showFirstButton
                  showLastButton
                />
              )}
            </Box>
            {listed.length === 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 2 }}>
                <Typography variant="h6" color="text.secondary">No cards in set matching filters</Typography>
                <Button variant="contained" color="primary" onClick={clearFilters}>Clear Filters</Button>
              </Box>
            ) : (
              <Grid container spacing={1.5}>
                {paged.map((c) => (
                  <Grid item key={c.id} xs={6} sm={4} md={3} lg={2} xl={2}>
                    <CardTile 
                      card={c} 
                      onAdd={addCard} 
                      onShow={setHoverCard} 
                      editMode={editMode}
                      onEdit={(card) => {
                        setEditingCard(card);
                        setEditorOpen(true);
                      }}
                      onToggleVerified={(card, checked) => {
                        const updated = { ...card, verified: !!checked };
                        saveCardEdit(card.id, updated);
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>

          {/* Build column: Leader + Deck + Import/Export */}
          <Box sx={{ flex: 1, borderLeft: '1px solid #ddd', p: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <Typography variant="subtitle2" gutterBottom>Leader</Typography>
            <Paper
              variant="outlined"
              sx={{ p: 1.5, mb: 1, width: 320, alignSelf: 'center', position: 'relative', minHeight: CARD_H + 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 1 }}
            >
              {leaderId ? (
                <>
                  <img src={cardImageUrl(byId.get(leaderId))} alt={leaderId} style={{ width: CARD_W, height: 'auto', display: 'block', borderRadius: 4 }} />
                  <Tooltip title="Remove leader">
                    <IconButton size="small" onClick={() => setConfirmLeaderOpen(true)} sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'error.main', color: 'white', '&:hover': { bgcolor: 'error.dark' } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">Click a Leader to set</Typography>
              )}
            </Paper>

            <Typography variant="subtitle2" gutterBottom>Deck ({items.reduce((a,b)=>a+b.count,0)}/50)</Typography>
            <Box sx={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
              <Grid container spacing={1.25} sx={{ p: 0.5 }}>
                {rightList.map((row) => (
                  <Grid key={row.id} item xs={6} sm={4} md={3} lg={2} xl={2}>
                    <DeckGridItem
                      card={row.card}
                      count={row.count}
                      onInc={() => inc(row.id)}
                      onDec={() => dec(row.id)}
                      onShow={setHoverCard}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>

            {/* Import / Export section moved here */}
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1, width: 420, alignSelf: 'center', flexShrink: 0 }}>
              <Typography variant="subtitle2" gutterBottom>Import / Export</Typography>
              <TextField
                multiline
                size="small"
                minRows={3}
                maxRows={4}
                value={deckText}
                onChange={(e) => importText(e.target.value)}
                fullWidth
                sx={{ '& textarea': { resize: 'vertical', fontSize: '0.8rem' } }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button variant="contained" color="info" startIcon={<ContentCopyIcon />} onClick={doCopy}>Copy</Button>
                <Tooltip 
                  title={
                    deckIssues.length > 0 ? (
                      <Box component="ul" sx={{ m: 0, pl: 2 }}>
                        {deckIssues.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </Box>
                    ) : 'Valid'
                  } 
                  componentsProps={{ tooltip: { sx: { fontSize: '0.9rem' } } }}
                >
                  <Chip label={deckIssues.length ? 'Invalid deck' : 'Valid deck'} color={deckIssues.length ? 'error' : 'success'} sx={{ cursor: 'default' }} />
                </Tooltip>
              </Stack>
            </Paper>
          </Box>
          {/* Middle drag handle */}
          <Box onMouseDown={(e) => onDragStart(e, 'middle')} sx={{ position: 'absolute', top: 0, left: (midLeftRef.current ? midLeftRef.current.offsetWidth : 0) - 3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 2 }} />
        </Box>

        {/* Right side: Preview only */}
        <Box sx={{ width: rightW, borderLeft: '1px solid #ddd', position: 'relative', display: 'flex', flexDirection: 'column', p: 1, overflow: 'hidden', minWidth: 320 }}>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Typography variant="subtitle2" gutterBottom>Preview</Typography>
            {hoverCard ? (
              <>
                <img src={cardImageUrl(hoverCard)} alt={hoverCard.id} style={{ width: '100%', height: 'auto', maxHeight: 600, objectFit: 'contain', boxShadow: '0 2px 16px rgba(0,0,0,0.18)', borderRadius: 8 }} />
                <Divider sx={{ my: 1 }} />
                <Stack spacing={1} sx={{ px: 0.5 }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ lineHeight: 1.15 }}>{hoverCard.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{hoverCard.id}</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ cursor: 'default' }}>
                    <Chip size="small" icon={<CategoryIcon />} label={hoverCard.category} color="primary" variant="outlined" />
                    {hoverCard?.verified ? (
                      <Chip size="small" icon={<VerifiedIcon sx={{ color: 'success.main' }} />} label={<span style={{ color: '#111', fontWeight: 600 }}>Verified</span>} sx={{ bgcolor: 'rgba(255,255,255,0.98)', border: '1px solid #333', color: '#111', fontWeight: 600 }} variant="outlined" />
                    ) : (
                      <Chip size="small" label={<span style={{ color: '#333' }}>Unverified</span>} sx={{ bgcolor: 'rgba(255,255,255,0.98)', border: '1px solid #333', color: '#333' }} variant="outlined" />
                    )}
                    {(hoverCard.rarity ? [hoverCard.rarity] : []).map((r) => (
                      <Chip key={r} size="small" label={r} variant="outlined" />
                    ))}
                    {(hoverCard.colors || []).map((c) => (
                      <Chip key={c} size="small" icon={<PaletteIcon />} label={c} sx={colorChipSx(c)} />
                    ))}
                    {hoverCard.attribute && (
                      <Chip size="small" icon={<LabelIcon />} label={hoverCard.attribute} variant="outlined" />
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ cursor: 'default' }}>
                    {hoverCard?.stats?.cost !== null && hoverCard?.stats?.cost !== undefined && (
                      <Chip size="small" icon={<MonetizationOnIcon />} label={`Cost ${hoverCard.stats.cost}`} variant="filled" />
                    )}
                    {hoverCard?.stats?.power !== null && hoverCard?.stats?.power !== undefined && (
                      <Chip size="small" icon={<FitnessCenterIcon />} label={`Power ${hoverCard.stats.power}`} variant="filled" />
                    )}
                    {hoverCard?.stats?.life !== null && hoverCard?.stats?.life !== undefined && (
                      <Chip size="small" icon={<FavoriteIcon />} label={`Life ${hoverCard.stats.life}`} variant="filled" />
                    )}
                    {hoverCard?.stats?.counter?.present ? (
                      <Chip size="small" icon={<ShieldIcon />} color="success" label={`Counter +${hoverCard.stats.counter.value}`} />
                    ) : null}
                  </Stack>
                  {(hoverCard.types || []).length ? (
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ cursor: 'default' }}>
                      <Chip size="small" icon={<StyleIcon />} label="Types" variant="outlined" />
                      {(hoverCard.types || []).map((t) => (
                        <Chip key={t} size="small" label={t} variant="outlined" />
                      ))}
                    </Stack>
                  ) : null}
                  {(hoverCard.keywords || []).length ? (
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ cursor: 'default' }}>
                      <Chip size="small" label="Keywords" variant="outlined" />
                      {(hoverCard.keywords || []).map((k) => (
                        <Chip key={k} size="small" color="secondary" variant="outlined" label={k} />
                      ))}
                    </Stack>
                  ) : null}
                  {hoverCard?.trigger?.text ? (
                    <Alert icon={<BoltIcon fontSize="inherit" />} severity="warning" sx={{ whiteSpace: 'pre-wrap' }}>
                      <strong>Trigger: </strong>{hoverCard.trigger.text}
                    </Alert>
                  ) : null}
                  {hoverCard?.text ? (
                    <Paper variant="outlined" sx={{ p: 1 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                        <ArticleIcon fontSize="small" />
                        <Typography variant="subtitle2">Card Text</Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{hoverCard.text}</Typography>
                    </Paper>
                  ) : null}
                  {/* Fallback minimal fields for completeness */}
                  <Box sx={{ display: 'none' }}>
                    <StatRow label="ID" value={hoverCard.id} />
                    <StatRow label="Set" value={hoverCard.set} />
                    <StatRow label="Number" value={hoverCard.number} />
                  </Box>
                </Stack>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">Hover over a card to preview</Typography>
            )}
          </Box>
          <Box onMouseDown={(e) => onDragStart(e, 'right')} sx={{ position: 'absolute', top: 0, left: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 2 }} />
        </Box>
      </Box>

      {/* Confirm remove leader */}
      <Dialog open={confirmLeaderOpen} onClose={() => setConfirmLeaderOpen(false)}>
        <DialogTitle>Remove Leader?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to remove the current leader from this deck?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLeaderOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => { setLeaderId(''); setConfirmLeaderOpen(false); }}>Remove</Button>
        </DialogActions>
      </Dialog>

      {/* Card Editor Dialog */}
      <CardEditorDialog 
        open={editorOpen}
        card={editingCard}
        onClose={() => setEditorOpen(false)}
        onSave={saveCardEdit}
      />

      <Snackbar open={!!copyState} autoHideDuration={2000} onClose={() => setCopyState('')}>
        <Alert severity="success" variant="filled">{copyState}</Alert>
      </Snackbar>
      <Snackbar open={!!message} autoHideDuration={2500} onClose={() => setMessage('')}>
        <Alert severity={/fail|error/i.test(message) ? 'error' : 'success'} variant="filled">{message}</Alert>
      </Snackbar>
    </Dialog>
  );
}
