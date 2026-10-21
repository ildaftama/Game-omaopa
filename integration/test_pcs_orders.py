import unittest
from pcs_orders import aggregate,quantities,fingerprint
from pcs_order_rules import mini
def row(n,date=None,text='Malmil Cheese (2)',qty=2,destination='Jakal UII',status='lunas'):
    r={'row':n,'3':{'value':text},'4':{'value':0},'5':{'value':0},'6':{'value':qty},'7':{'value':0},'10':{'value':destination},'11':{'value':34000},'13':{'value':status}}
    if date:r['0']={'value':date}
    return r
class OrdersTest(unittest.TestCase):
    def test_units_and_factory(self):
        a=aggregate([row(5577,46023),row(5578,46023,destination='Pabrik')]);self.assertEqual(a['days'][0]['qty'][2],2);self.assertEqual(a['excludedRecords'],1)
        self.assertEqual(mini('1 mix','Mini 1 box mix')['composition'],{'cheese':3,'choco':3,'durian':3})
    def test_changed_note_cannot_inherit_old_review(self):
        r=row(5577,46023);review={fingerprint(r):{'nonSale':True}};self.assertEqual(aggregate([r],review)['excludedRecords'],1)
        r['3']['value']='Malmil Cheese (3)';self.assertEqual(aggregate([r],review)['excludedRecords'],0)
    def test_unknown_is_not_zero_and_no_price_division(self):
        r=row(5577,46023,text='Malmil cheese untuk acara',qty=None);self.assertEqual(quantities(r)[2],1)
        r['3']['value']='Malmil Cheese (7) @ 13.000';self.assertEqual(quantities(r)[2],7)
        r['3']['value']='Malmil untuk acara';r['7']['value']=None;self.assertIsNone(quantities(r)[2]);self.assertIsNone(quantities(r)[3])
    def test_unallocated_blocks_date(self):
        a=aggregate([row(5577,46023,destination='Tidak diketahui')]);self.assertTrue(a['blockedDates'])
    def test_topping_does_not_change_cake_flavor(self):
        r=row(5577,46023,text='Malmil Cheese Topping Choco 2 @ 20.000',qty=2);r['7']['value']=None
        self.assertEqual(quantities(r)[:4],[0,0,2,0])
        r=row(5577,46023,text='Malmil Choco Topping Cheese 1 @ 20.000',qty=None);r['7']['value']=1
        self.assertEqual(quantities(r)[:4],[0,0,0,1])
    def test_chiffon_variants_recovered_only_from_written_count(self):
        r=row(5577,46023,text='Chiffon Klasik Extra Keju (2) @35.000\nCisfon Klasik Keju 1 @34.000');r['9']={'value':'2 kls ec 1 kls'}
        self.assertEqual(quantities(r)[7:],[1,2,0,0,0])
        r['3']['value']='Chiffon Lite (2) @17.000';r['9']['value']='2 lite'
        self.assertEqual(quantities(r)[7:],[0,0,0,0,2])
    def test_written_quantities_and_owner_defaults(self):
        r=row(5577,46023,text='Malmil Coklat polos 10 x12.000 =120.000',qty=None);r['7']['value']=None
        self.assertEqual(quantities(r)[:4],[0,0,0,10])
        r['3']['value']='2 Malmil Cheese full cheese 3 x17.000 =34.000'
        self.assertEqual(quantities(r)[:4],[0,0,2,0])
        r['3']['value']='1x Malmil Cheese Topping Choco (Rp20.000)'
        self.assertEqual(quantities(r)[:4],[0,0,1,0])
        r['3']['value']='Malmil Cheese'
        self.assertEqual(quantities(r)[:4],[0,0,1,0])
    def test_typo_aliases_and_lite_owner_confirmation(self):
        r=row(5577,46023,text='2 Chisfon extra keju @33.000',qty=0);r['9']={'value':2}
        self.assertEqual(quantities(r)[7:],[0,2,0,0,0])
        r['3']['value']='Chiffon Lite';r['9']['value']='2 lite'
        self.assertEqual(quantities(r)[7:],[0,0,0,0,2])
        r['3']['value']='Cisfon 2';r['9']['value']=2
        self.assertEqual(quantities(r)[7:],[None,None,None,0,0])
    def test_mini_custom_composition_not_multiplied_twice(self):
        r=row(5577,46023,text='30 box mini dengan rincian',qty=0);r['8']={'value':'84 cheese 93 cho 93 durian'}
        self.assertEqual(quantities(r)[4:7],[84,93,93])
        r['8']['value']='mix 6 box';r['3']['value']='Mini cheese 18\nMini choco 18\nMini durian 18\nMini mix 6 box'
        self.assertEqual(quantities(r)[4:7],[18,18,18])
        r['8']['value']='1 box mix 5pcs choco 5 pcs cheese';r['3']['value']='Mini mix 1 box\nMini choco 5 pcs\nMini cheese 5 pcs'
        self.assertEqual(quantities(r)[4:7],[8,8,3])
    def test_two_flavor_mini_box_owner_composition_and_incomplete_description(self):
        r=row(5577,46023,text='Mini ogura cheese + choco (2) x56.000',qty=0)
        self.assertEqual(quantities(r)[4:7],[8,10,0])
        r['8']={'value':'11 box mix 1 box full durian 1 box isi 3 pcs cheese 6 pcs'}
        r['3']['value']='11 box mini mix\n1 box mini full durian'
        self.assertEqual(quantities(r)[4:7],[None,None,None])
    def test_wrong_column_is_recovered_only_when_written_family_is_clear(self):
        r=row(5577,46023,text='Mini mix 2 box',qty=0);r['9']={'value':'2 mix'}
        self.assertEqual(quantities(r)[4:],[6,6,6,0,0,0,0,0])
        r['9']['value']=None;r['8']={'value':'1 lite keju'};r['3']['value']='1x Chiffon Lite Keju'
        self.assertEqual(quantities(r)[4:],[0,0,0,0,0,0,0,1])
    def test_revenue_outlet_overrides_delivery_and_exclusions_remain_bound(self):
        from pcs_order_rules import outlet
        self.assertEqual(outlet('Ngaliyan penjualan masuk UKSW')[1],'uksw')
        self.assertEqual(outlet('UKSW omset Merbabu')[1],'merbabu')
        self.assertEqual(outlet('udimus')[1],'udinus')
        self.assertEqual(outlet('uimus16.0')[1],'unimus')
        self.assertEqual(outlet('NGALIYAN16.00 prnjualan masuk UKSW')[1],'uksw')
        r=row(5577,46023,destination='Tidak diketahui');a=aggregate([r],{fingerprint(r):{'excludeFromOutlet':True}})
        self.assertFalse(a['blockedDates']);self.assertEqual(a['excludedRecords'],1)
if __name__=='__main__':unittest.main()
