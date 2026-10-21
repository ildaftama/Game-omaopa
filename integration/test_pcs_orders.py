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
        r=row(5577,46023,text='Malmil cheese untuk acara',qty=None);self.assertIsNone(quantities(r)[2])
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
        self.assertEqual(quantities(r)[7:],[0,0,0,None,None])
if __name__=='__main__':unittest.main()
